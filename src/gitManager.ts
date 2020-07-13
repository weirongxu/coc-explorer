import pathLib from 'path';
import { onError } from './logger';
import { execCli, normalizePath } from './util';
import { config } from './config';

export enum GitFormat {
  mixed = '*',
  unmodified = ' ',
  modified = 'M',
  added = 'A',
  deleted = 'D',
  renamed = 'R',
  copied = 'C',
  unmerged = 'U',
  untracked = '?',
  ignored = '!',
}

export type GitFormatForY = Exclude<GitFormat, GitFormat.ignored>;

export type GitStatus = {
  fullpath: string;
  x: GitFormat;
  y: GitFormatForY;

  added: boolean;
  modified: boolean;
  deleted: boolean;
  renamed: boolean;
  copied: boolean;

  stated: boolean;
  unmerged: boolean;
  untracked: boolean;
  ignored: boolean;
};

export type GitMixedStatus = {
  x: GitFormat;
  y: GitFormatForY;
};

class GitCommand {
  spawn(args: string[], { cwd }: { cwd?: string } = {}) {
    return execCli(config.get<string>('git.command')!, args, {
      cwd,
    });
  }

  async getRoot(cwd: string) {
    const output = await this.spawn(['rev-parse', '--show-toplevel'], {
      cwd,
    });
    return normalizePath(output.trim());
  }

  private parseStatusFormat(format: string): GitFormat {
    return (
      Object.values(GitFormat).find((it) => it === format) ??
      GitFormat.unmodified
    );
  }

  private parsePath(str: string, hasArrow: boolean): string[] {
    let index = 0;
    let path = '';
    let inPath = false;
    let inQuote = false;
    let inEscape = false;
    const paths: string[] = [];
    while (index < str.length) {
      const ch = str[index];
      if (!inPath && !inQuote) {
        // start parse a path
        if (ch === '"') {
          inQuote = true;
          index += 1;
        }
        path = '';
        inPath = true;
        continue;
      } else {
        if (inQuote) {
          if (inEscape) {
            path += ch === 't' ? '\t' : ch;
            inEscape = false;
          } else {
            if (ch === '"') {
              paths.push(path);
              inQuote = false;
              inPath = false;
            } else if (ch === '\\') {
              inEscape = true;
            } else {
              path += ch;
            }
          }
        } else {
          if (ch === ' ') {
            if (hasArrow && str.slice(index, index + 4) === ' -> ') {
              if (path.length) {
                paths.push(path);
              }
              index += 3;
              inPath = false;
            } else {
              path += ch;
            }
          } else {
            path += ch;
          }
        }
      }
      index += 1;
    }
    if (inPath) {
      paths.push(path);
      inPath = false;
    }
    return paths;
  }

  private parseStatusLine(gitRoot: string, line: string) {
    const xFormat = this.parseStatusFormat(line[0]);
    const yFormat = this.parseStatusFormat(line[1]);
    const rawPath = line.slice(3);
    const hasArrow =
      [GitFormat.renamed, GitFormat.copied].includes(xFormat) ||
      [GitFormat.renamed, GitFormat.copied].includes(yFormat);
    const paths = this.parsePath(rawPath, hasArrow);
    return [
      xFormat,
      yFormat,
      ...paths.map((p) => pathLib.join(gitRoot, p)),
    ] as [GitFormat, GitFormat, string, string | undefined];
  }

  async status(
    root: string,
    showIgnored: boolean,
  ): Promise<Record<string, GitStatus>> {
    const gitStatus: Record<string, GitStatus> = {};

    const args = ['status', '--porcelain', '-u'];
    if (showIgnored) {
      args.push('--ignored=matching');
    }
    const output = await this.spawn(args, { cwd: root });
    const lines = output.split('\n');
    lines.forEach((line) => {
      const [x_, y_, leftpath, rightpath] = this.parseStatusLine(root, line);
      const x = x_ === GitFormat.untracked ? GitFormat.unmodified : x_;
      const y = y_ === GitFormat.ignored ? GitFormat.unmodified : y_;

      const changedList = [
        GitFormat.modified,
        GitFormat.added,
        GitFormat.deleted,
        GitFormat.renamed,
        GitFormat.copied,
      ];
      const added = x === GitFormat.added || y === GitFormat.added;
      const modified = x === GitFormat.modified || y === GitFormat.modified;
      const deleted = x === GitFormat.deleted || y === GitFormat.deleted;
      const renamed = x === GitFormat.renamed || y === GitFormat.renamed;
      const copied = x === GitFormat.copied || y === GitFormat.copied;
      const stated = changedList.includes(x) && y === GitFormat.unmodified;
      const unmerged =
        (x === GitFormat.deleted && y === GitFormat.deleted) ||
        (x === GitFormat.added && y === GitFormat.added) ||
        x === GitFormat.unmerged ||
        y === GitFormat.unmerged;
      const ignored = x === GitFormat.ignored;
      const untracked = y === GitFormat.untracked;

      const fullpath = rightpath ? rightpath : leftpath;
      gitStatus[fullpath] = {
        fullpath,
        x,
        y,

        added,
        modified,
        deleted,
        renamed,
        copied,

        stated,
        unmerged,
        untracked,
        ignored,
      };
    });

    return gitStatus;
  }

  async stage(paths: string[]) {
    if (paths.length) {
      const root = await this.getRoot(pathLib.dirname(paths[0]));
      await this.spawn(['add', ...paths], { cwd: root });
    }
  }

  async unstage(paths: string[]) {
    if (paths.length) {
      const root = await this.getRoot(pathLib.dirname(paths[0]));
      await this.spawn(['reset', ...paths], { cwd: root });
    }
  }

  async checkIgnore(paths: string[]): Promise<string[]> {
    if (!paths.length) {
      return [];
    }
    const root = await this.getRoot(pathLib.dirname(paths[0]));
    const output = await this.spawn(['check-ignore', ...paths], { cwd: root });
    return output.split(/\n/g);
  }
}

class GitManager {
  cmd = new GitCommand();

  /**
   * rootCache[fullpath] = rootPath
   **/
  private rootCache: Record<string, string> = {};
  /**
   * statusCache[rootPath][filepath] = GitStatus
   **/
  private statusCache: Record<string, Record<string, GitStatus>> = {};
  /**
   * mixedStatusCache[rootPath][filepath] = GitStatus
   **/
  private mixedStatusCache: Record<string, Record<string, GitMixedStatus>> = {};
  /**
   * ignoreCache[rootPath] = filepath[]
   **/
  private ignoreCache: Record<string, string[]> = {};

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
      this.statusCache[root] = await this.cmd.status(root, showIgnored);
      this.mixedStatusCache[root] = {};
      this.ignoreCache[root] = [];

      // generate mixed status cache
      Object.entries(this.statusCache[root]).forEach(([fullpath, status]) => {
        const relativePath = pathLib.relative(root, fullpath);
        const parts = relativePath.split(pathLib.sep);
        if (status.x === GitFormat.ignored) {
          this.ignoreCache[root].push(fullpath);
          return;
        }
        for (let i = 1; i <= parts.length; i++) {
          const frontalPath = pathLib.join(
            root,
            parts.slice(0, i).join(pathLib.sep),
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

  getRootStatuses(rootPath: string) {
    return this.mixedStatusCache[rootPath] as
      | Record<string, GitMixedStatus>
      | undefined;
  }

  async getStatuses(path: string) {
    const root = await this.getGitRoot(path);
    if (root) {
      return this.getRootStatuses(root) || {};
    } else {
      return {};
    }
  }

  getStatus(
    fullpath_: string,
    isDirectory = false,
  ): GitMixedStatus | undefined {
    const fullpath = isDirectory ? fullpath_ + '/' : fullpath_;
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
      const ignore = ignorePair[1].find((ignorePath) =>
        fullpath.startsWith(ignorePath),
      );
      if (ignore) {
        return { x: GitFormat.ignored, y: GitFormat.unmodified };
      }
    }
  }
}

export const gitManager = new GitManager();
