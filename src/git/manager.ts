import { sleep } from 'coc-helper';
import { Disposable, disposeAll, workspace } from 'coc.nvim';
import pathLib from 'path';
import { config } from '../config';
import { internalEvents, onEvent } from '../events';
import { ExplorerManager } from '../explorerManager';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { debounce, mapGetWithDefault, onError, sum } from '../util';
import { GitCommand } from './command';
import {
  GitFormat,
  GitMixedStatus,
  GitRootFormat,
  GitRootStatus,
} from './types';

const statusEqual = (a: GitMixedStatus, b: GitMixedStatus) => {
  return a.x === b.x && a.y === b.y;
};

class Binder {
  protected sourcesBinding: Map<
    ExplorerSource<BaseTreeNode<any>>,
    { refCount: number }
  > = new Map();
  private showIgnored: boolean;
  private prevStatuses: Record<string, GitMixedStatus> = {};
  private registerForSourceDisposables: Disposable[] = [];
  private registerDisposables: Disposable[] = [];
  private inited = false;

  explorerManager_?: ExplorerManager;
  get explorerManager() {
    if (!this.explorerManager_) {
      throw new Error('explorerManager not initialized yet');
    }
    return this.explorerManager_;
  }

  get sources() {
    return Array.from(this.sourcesBinding.keys());
  }

  get refTotalCount() {
    return sum(Array.from(this.sourcesBinding.values()).map((b) => b.refCount));
  }

  constructor() {
    const deprecatedShowIgnored = config.get<boolean>(
      'file.column.git.showIgnored',
    );
    if (deprecatedShowIgnored !== undefined) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        'explorer.file.column.git.showIgnored has been deprecated, please use explorer.git.showIgnored in coc-settings.json',
        'warning',
      );
      this.showIgnored = deprecatedShowIgnored;
    } else {
      this.showIgnored = config.get<boolean>('git.showIgnored')!;
    }
  }

  protected init_(source: ExplorerSource<BaseTreeNode<any>>) {
    if (!this.inited) {
      this.inited = true;
      this.explorerManager_ = source.explorer.explorerManager;
    }
  }

  bind(source: ExplorerSource<BaseTreeNode<any>>) {
    this.init_(source);
    const binding = mapGetWithDefault(this.sourcesBinding, source, () => ({
      refCount: 0,
    }));
    binding.refCount += 1;
    if (binding.refCount === 1) {
      this.registerForSourceDisposables = this.registerForSource(source);
    }
    if (this.refTotalCount === 1) {
      this.registerDisposables = this.register();
    }
    return Disposable.create(() => {
      binding.refCount -= 1;
      if (binding.refCount === 0) {
        disposeAll(this.registerForSourceDisposables);
        this.registerForSourceDisposables = [];
      }
      if (this.refTotalCount === 0) {
        disposeAll(this.registerDisposables);
        this.registerDisposables = [];
      }
    });
  }

  protected register() {
    return [
      internalEvents.on(
        'CocGitStatusChange',
        debounce(1000, async () => {
          await this.reload(this.sources, workspace.cwd, false);
        }),
      ),
      onEvent(
        'BufWritePost',
        debounce(1000, async (bufnr) => {
          const fullpath = this.explorerManager.bufManager.getBufferNode(bufnr)
            ?.fullpath;
          if (fullpath) {
            const filename = pathLib.basename(fullpath);
            const dirname = pathLib.dirname(fullpath);
            const isReloadAll = filename === '.gitignore';
            await this.reload(this.sources, dirname, isReloadAll);
          }
        }),
      ),
    ];
  }

  protected registerForSource(
    source: ExplorerSource<BaseTreeNode<any, string>>,
  ) {
    return [
      source.events.on('loaded', async (node) => {
        const directory =
          'isRoot' in node
            ? source.root
            : node.expandable
            ? node.fullpath
            : node.fullpath && pathLib.dirname(node.fullpath);
        if (directory) {
          let isTimeout = false;
          await Promise.race([
            (async () => {
              await sleep(200);
              isTimeout = true;
            })(),
            (async () => {
              const renderPaths = await this.reload([], directory, true);
              if (isTimeout) {
                await source.renderPaths(renderPaths);
              }
            })(),
          ]);
        }
      }),
    ];
  }

  async reload(
    sources: ExplorerSource<any>[],
    directory: string,
    isReloadAll: boolean,
  ) {
    await gitManager.reload(directory, this.showIgnored);

    // render paths
    const statuses = await gitManager.getMixedStatuses(directory);

    const updatePaths: Set<string> = new Set();
    if (isReloadAll) {
      for (const fullpath of Object.keys(statuses)) {
        updatePaths.add(fullpath);
      }
      for (const fullpath of Object.keys(this.prevStatuses)) {
        updatePaths.add(fullpath);
      }
    } else {
      for (const [fullpath, status] of Object.entries(statuses)) {
        if (fullpath in this.prevStatuses) {
          if (statusEqual(this.prevStatuses[fullpath], status)) {
            continue;
          }
          delete this.prevStatuses[fullpath];
        }
        updatePaths.add(fullpath);
      }
      for (const fullpath of Object.keys(this.prevStatuses)) {
        updatePaths.add(fullpath);
      }
    }

    for (const source of sources) {
      await source.renderPaths(updatePaths);
    }

    this.prevStatuses = statuses;
    return updatePaths;
  }
}

class GitManager {
  cmd = new GitCommand();

  /**
   * rootCache[fullpath] = rootPath
   **/
  private rootCache: Record<string, string> = {};
  /**
   * mixedStatusCache[rootPath][filepath] = GitStatus
   **/
  private mixedStatusCache: Record<string, Record<string, GitMixedStatus>> = {};
  /**
   * rootStatusCache[rootPath] = GitRootStatus
   */
  private rootStatusCache: Record<string, GitRootStatus> = {};
  /**
   * ignoreCache[rootPath] = {directories: string[], files: string[]}
   **/
  private ignoreCache: Record<
    string,
    { directories: string[]; files: string[] }
  > = {};
  private binder = new Binder();

  async getGitRoot(directory: string): Promise<string | undefined> {
    if (directory in this.rootCache) {
      return this.rootCache[directory];
    }

    const parts = directory.split(pathLib.sep);
    const idx = parts.indexOf('.git');
    if (idx !== -1) {
      const root = parts.slice(0, idx).join(pathLib.sep);
      this.rootCache[directory] = root;
    } else {
      try {
        const gitRoot = await this.cmd.getRoot(directory);
        if (pathLib.isAbsolute(gitRoot)) {
          this.rootCache[directory] = gitRoot;
        } else {
          pathLib.join(directory, gitRoot);
        }
      } catch (error) {
        onError(error);
        return;
      }
    }
    return this.rootCache[directory];
  }

  async reload(directory: string, showIgnored: boolean) {
    const root = await this.getGitRoot(directory);
    if (root) {
      const statusRecord = await this.cmd.status(root, showIgnored);
      const statusArray = Object.values(statusRecord);

      // generate rootStatusCache
      const rootStatus: GitRootStatus = (this.rootStatusCache[root] = {
        allStaged: true,
        formats: [],
      });

      if (await this.cmd.hasStashed(root)) {
        rootStatus.formats.push(GitRootFormat.stashed);
      }
      if (await this.cmd.hasPull(root)) {
        rootStatus.formats.push(GitRootFormat.behind);
      }
      if (await this.cmd.hasPush(root)) {
        rootStatus.formats.push(GitRootFormat.ahead);
      }
      if (statusArray.some((s) => s.y === GitFormat.unmerged)) {
        rootStatus.formats.push(GitRootFormat.conflicted);
      }
      if (statusArray.some((s) => s.y === GitFormat.untracked)) {
        rootStatus.formats.push(GitRootFormat.untracked);
      }
      if (
        statusArray.some(
          (s) => s.x === GitFormat.modified || s.y === GitFormat.modified,
        )
      ) {
        rootStatus.formats.push(GitRootFormat.modified);
      }
      if (statusArray.some((s) => s.x === GitFormat.added)) {
        rootStatus.formats.push(GitRootFormat.added);
      }
      if (statusArray.some((s) => s.x === GitFormat.renamed)) {
        rootStatus.formats.push(GitRootFormat.renamed);
      }
      if (
        statusArray.some(
          (s) => s.x === GitFormat.deleted || s.y === GitFormat.deleted,
        )
      ) {
        rootStatus.formats.push(GitRootFormat.deleted);
      }

      if (statusArray.some((s) => s.y !== GitFormat.unmodified)) {
        rootStatus.allStaged = false;
      }

      // generate mixedstatusCache & ignoreCache
      this.mixedStatusCache[root] = {};
      this.ignoreCache[root] = {
        directories: [],
        files: [],
      };

      Object.entries(statusRecord).forEach(([fullpath, status]) => {
        if (status.x === GitFormat.ignored) {
          if (['/', '\\'].includes(fullpath[fullpath.length - 1])) {
            this.ignoreCache[root].directories.push(fullpath);
          } else {
            this.ignoreCache[root].files.push(fullpath);
          }
          return;
        }

        const relativePath = pathLib.relative(root, fullpath);
        const parts = relativePath.split(pathLib.sep);
        for (let i = 1; i <= parts.length; i++) {
          const frontalPath = pathLib.join(
            root,
            pathLib.join(...parts.slice(0, i)),
          );
          const cache = this.mixedStatusCache[root][frontalPath];
          if (cache) {
            if (cache.x !== GitFormat.mixed) {
              if (cache.x !== status.x) {
                if (cache.x === GitFormat.unmodified) {
                  cache.x = status.x;
                } else if (status.x !== GitFormat.unmodified) {
                  cache.x = GitFormat.mixed;
                }
              }
            }
            if (cache.y !== GitFormat.mixed) {
              if (cache.y !== status.y) {
                if (cache.y === GitFormat.unmodified) {
                  cache.y = status.y;
                } else if (status.y !== GitFormat.unmodified) {
                  cache.y = GitFormat.mixed;
                }
              }
            }
          } else {
            this.mixedStatusCache[root][frontalPath] = {
              x: status.x,
              y: status.y,
            };
          }
        }
      });
    }
  }

  /**
   * Automatically update column, when git reload
   *
   * @example
   * ```typescript
   * columnRegistrar.registerColumn(
   *   'columnType',
   *   'columnName',
   *   ({ source, subscriptions }) => {
   *     return {
   *       async init() {
   *         subscriptions.push(gitManager.bindColumn(source));
   *       },
   *       async draw() {
   *         ...
   *       },
   *     };
   *   },
   * );
   * ```
   */
  bindColumn(source: ExplorerSource<any>) {
    return this.binder.bind(source);
  }

  async getMixedStatuses(path: string) {
    const rootPath = await this.getGitRoot(path);
    if (rootPath) {
      return this.mixedStatusCache[rootPath] || {};
    } else {
      return {};
    }
  }

  getMixedStatus(
    fullpath: string,
    isDirectory = false,
  ): GitMixedStatus | undefined {
    // TODO simplify
    const statusPair = Object.entries(this.mixedStatusCache)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .find(([rootPath]) => fullpath.startsWith(rootPath));
    if (statusPair) {
      const pathsStatus = statusPair[1];
      if (fullpath in pathsStatus) {
        return pathsStatus[fullpath];
      }
    }

    const ignorePair = Object.entries(this.ignoreCache)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .find(([rootPath]) => fullpath.startsWith(rootPath));
    if (ignorePair) {
      let ignore = false;
      if (isDirectory) {
        const directoryPath = isDirectory ? fullpath + pathLib.sep : fullpath;
        ignore = ignorePair[1].directories.some((ignorePath) =>
          directoryPath.startsWith(ignorePath),
        );
      } else {
        ignore = ignorePair[1].files.some(
          (ignorePath) => fullpath === ignorePath,
        );
        if (!ignore) {
          ignore = ignorePair[1].directories.some((ignorePath) =>
            fullpath.startsWith(ignorePath),
          );
        }
      }
      if (ignore) {
        return { x: GitFormat.ignored, y: GitFormat.unmodified };
      }
    }
  }

  getRootStatus(root: string): GitRootStatus | undefined {
    return this.rootStatusCache[root];
  }
}

export const gitManager = new GitManager();
