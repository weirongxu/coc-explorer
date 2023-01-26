import { Disposable } from 'coc.nvim';
import pathLib from 'path';
import { config } from '../config';
import type { ExplorerSource } from '../source/source';
import { compactI, logger } from '../util';
import { GitBinder } from './binder';
import { GitCommand } from './command';
import {
  GitFormat,
  GitIgnore,
  GitMixedStatus,
  GitRootFormat,
  GitRootStatus,
} from './types';

class GitManager {
  cmd = new GitCommand();

  /**
   * rootCache[fullpath] = rootPath
   **/
  private rootCache = new Map<string, string>();
  /**
   * mixedStatusMapCacheInRoot[rootPath][filepath] = GitStatus
   **/
  private mixedStatusMapCacheInRoot = new Map<
    string,
    Map<string, GitMixedStatus>
  >();
  /**
   * ignoreMapCacheInRoot[rootPath][filepath] = GitIgnore
   **/
  private ignoreMapCacheInRoot = new Map<string, Map<string, GitIgnore>>();
  /**
   * rootStatusCache[rootPath] = GitRootStatus
   */
  private rootStatusCache = new Map<string, GitRootStatus>();
  private binder = new GitBinder();

  private showIgnored: boolean;
  private showUntrackedFiles: GitCommand.ShowUntrackedFiles;

  constructor() {
    this.showIgnored = config.get<boolean>('git.showIgnored')!;

    this.showUntrackedFiles = config.get<GitCommand.ShowUntrackedFiles>(
      'file.git.showUntrackedFiles',
    )!;
  }

  async getGitRoots(directories: string[] | Set<string>): Promise<string[]> {
    const directorySet = [...new Set(directories)];
    const roots = await Promise.all(
      directorySet.map((directory) => this.getGitRoot(directory)),
    );
    return compactI(roots);
  }

  async getGitRoot(directory: string): Promise<string | undefined> {
    const root = this.rootCache.get(directory);
    if (root) return root;

    const parts = directory.split(pathLib.sep);
    const idx = parts.indexOf('.git');
    if (idx !== -1) {
      const root = parts.slice(0, idx).join(pathLib.sep);
      this.rootCache.set(directory, root);
    } else {
      try {
        const gitRoot = await this.cmd.getRoot(directory);
        if (pathLib.isAbsolute(gitRoot)) {
          this.rootCache.set(directory, gitRoot);
        } else {
          pathLib.join(directory, gitRoot);
        }
      } catch (error) {
        logger.error(error);
        return;
      }
    }
    return this.rootCache.get(directory);
  }

  async reload(
    directory: string,
    options: GitCommand.StatusOptions = {},
  ): Promise<string | undefined> {
    const root = await this.getGitRoot(directory);
    if (root) {
      const statusOptions = {
        showIgnored: options.showIgnored ?? this.showIgnored,
        showUntrackedFiles:
          options.showUntrackedFiles ?? this.showUntrackedFiles,
      };

      const statusRecord = await this.cmd.status(root, statusOptions);
      const statusArray = [...statusRecord.values()];

      // generate rootStatusCache
      const rootStatus: GitRootStatus = {
        allStaged: true,
        formats: [],
      };
      this.rootStatusCache.set(root, rootStatus);

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
      const mixedStatusMap = new Map<string, GitMixedStatus>();
      const ignoreMap = new Map<string, GitIgnore>();
      this.mixedStatusMapCacheInRoot.set(root, mixedStatusMap);
      this.ignoreMapCacheInRoot.set(root, ignoreMap);

      statusRecord.forEach((status, fullpath) => {
        if (status.x === GitFormat.ignored) {
          if (['/', '\\'].includes(fullpath[fullpath.length - 1])) {
            ignoreMap.set(fullpath, GitIgnore.directory);
          } else {
            ignoreMap.set(fullpath, GitIgnore.file);
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
          const cache = mixedStatusMap.get(frontalPath);
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
            mixedStatusMap.set(frontalPath, {
              x: status.x,
              y: status.y,
            });
          }
        }
      });
    }
    return root;
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
    const enabled = config.get<boolean>('git.enable')!;
    if (!enabled) {
      return Disposable.create(() => {});
    }
    return this.binder.bind(source);
  }

  getMixedStatusesByRoot(rootPath: string): Map<string, GitMixedStatus> {
    return this.mixedStatusMapCacheInRoot.get(rootPath) || new Map();
  }

  getIgnoreByRoot(rootPath: string): Map<string, GitIgnore> {
    return this.ignoreMapCacheInRoot.get(rootPath) || new Map();
  }

  getMixedStatus(
    fullpath: string,
    isDirectory: boolean,
  ): GitMixedStatus | undefined {
    // TODO getMixedStatus by root
    const statusPair = [...this.mixedStatusMapCacheInRoot.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .find(([rootPath]) => fullpath.startsWith(rootPath));
    if (statusPair) {
      const pathStatus = statusPair[1].get(fullpath);
      if (pathStatus) {
        return pathStatus;
      }
    }

    const ignorePair = [...this.ignoreMapCacheInRoot.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .find(([rootPath]) => fullpath.startsWith(rootPath));
    if (ignorePair) {
      const gitIgnores = ignorePair[1];
      const isIgnore = [...gitIgnores.entries()].some(
        ([ignorePath, gitIgnore]) => {
          if (gitIgnore === GitIgnore.file) {
            return ignorePath === fullpath;
          } else {
            const directoryPath = isDirectory
              ? fullpath + pathLib.sep
              : fullpath;
            return directoryPath.startsWith(ignorePath);
          }
        },
      );
      if (isIgnore) {
        return { x: GitFormat.ignored, y: GitFormat.unmodified };
      }
    }
  }

  getRootStatus(root: string): GitRootStatus | undefined {
    return this.rootStatusCache.get(root);
  }
}

export const gitManager = new GitManager();
