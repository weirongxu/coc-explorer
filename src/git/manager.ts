import { Disposable, disposeAll, workspace } from 'coc.nvim';
import pathLib from 'path';
import { internalEvents, onEvent } from '../events';
import { FileSource } from '../source/sources/file/fileSource';
import { debounce, onError } from '../util';
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

type BindType = 'root' | 'child';

class FileSourceGitBinding implements Disposable {
  public refCounts: Record<BindType, number> = {
    root: 0,
    child: 0,
  };

  private showIgnored: boolean;
  private prevStatuses = {} as Record<string, GitMixedStatus>;
  private disposables: Disposable[] = [];

  constructor(private source: FileSource) {
    this.disposables.push(
      source.events.on('loaded', async (node) => {
        const root =
          'isRoot' in node
            ? source.root
            : node.directory
            ? node.fullpath
            : pathLib.dirname(node.fullpath);
        await this.reload(root, true);
      }),
      onEvent(
        'BufWritePost',
        debounce(1000, async (bufnr) => {
          const fullpath = source.bufManager.getBufferNode(bufnr)?.fullpath;
          if (fullpath) {
            const filename = pathLib.basename(fullpath);
            const dirname = pathLib.dirname(fullpath);
            const isReloadAll = filename === '.gitignore';
            await this.reload(dirname, isReloadAll);
          }
        }),
      ),
      internalEvents.on(
        'CocGitStatusChange',
        debounce(1000, async () => {
          await this.reload(workspace.cwd, false);
        }),
      ),
    );

    this.showIgnored = source.getColumnConfig<boolean>('git.showIgnored')!;
  }

  dispose() {
    disposeAll(this.disposables);
  }

  async reload(directory: string, isReloadAll: boolean) {
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

    await this.source.renderPaths(updatePaths);
    this.prevStatuses = statuses;
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
  private fileSourceBindings: Map<FileSource, FileSourceGitBinding> = new Map();

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

  bindFileSource(source: FileSource, type: BindType) {
    const binding = (() => {
      const binding = this.fileSourceBindings.get(source);
      if (!binding) {
        const binding = new FileSourceGitBinding(source);
        this.fileSourceBindings.set(source, binding);
        return binding;
      }
      return binding;
    })();
    binding.refCounts[type] += 1;
    return Disposable.create(() => {
      binding.refCounts[type] -= 1;
      if (binding.refCounts.root <= 0 && binding.refCounts.child <= 0) {
        binding.dispose();
        this.fileSourceBindings.delete(source);
      }
    });
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
