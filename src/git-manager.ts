import { spawn } from 'child_process';
import { config } from './util';
import pathLib from 'path';
import { onError } from './logger';

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

export type GitStatus = {
  fullpath: string;
  x: GitFormat;
  y: GitFormat;

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

export type GitDirectoryStatus = {
  x: GitFormat;
  y: GitFormat;
};

class GitCommand {
  spawn(args: string[], { cwd }: { cwd?: string } = {}) {
    const streams = spawn(config.get<string>('git.command')!, args, {
      cwd,
    });

    let output = '';
    streams.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });
    return new Promise<string>((resolve, reject) => {
      streams.stdout.on('error', (error) => {
        reject(error);
      });
      streams.stdout.on('end', () => {
        resolve(output);
      });
    });
  }

  async getRoot(cwd: string) {
    const output = await this.spawn(['rev-parse', '--show-toplevel'], {
      cwd,
    });
    return output.trim();
  }

  private parseStatusFormat(format: string): GitFormat {
    for (const name in GitFormat) {
      if (format === GitFormat[name]) {
        return GitFormat[name] as GitFormat;
      }
    }
    return GitFormat.unmodified;
  }

  private parseStatusLine(gitRoot: string, line: string): [string, GitFormat, GitFormat] {
    return [pathLib.join(gitRoot, line.slice(3)), this.parseStatusFormat(line[0]), this.parseStatusFormat(line[1])];
  }

  async status(root: string, showIgnored: boolean): Promise<Record<string, GitStatus>> {
    const gitStatus: Record<string, GitStatus> = {};

    const args = ['status', '--porcelain', '-u'];
    if (showIgnored) {
      args.push('--ignored');
    }
    const output = await this.spawn(args, { cwd: root });
    const lines = output.split('\n');
    lines.forEach((line) => {
      const [fullpath, x, y] = this.parseStatusLine(root, line);

      const changedList = [GitFormat.modified, GitFormat.added, GitFormat.deleted, GitFormat.renamed, GitFormat.copied];
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
      const untracked = x === GitFormat.untracked;

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

  async stage(...path: string[]) {
    await this.spawn(['add', ...path]);
  }

  async unstage(...path: string[]) {
    await this.spawn(['reset', ...path]);
  }
}

class GitManager {
  cmd = new GitCommand();

  private rootCache: Record<string, string> = {};
  private statusCache: Record<string, Record<string, GitStatus>> = {};
  private directoryStatusCache: Record<string, Record<string, GitDirectoryStatus>> = {};

  async getGitRoot(folderPath: string): Promise<string | undefined> {
    if (folderPath in this.rootCache) {
      return this.rootCache[folderPath];
    }

    const parts = folderPath.split(pathLib.sep);
    const idx = parts.indexOf('.git');
    if (idx !== -1) {
      const root = parts.slice(0, idx).join(pathLib.sep);
      this.rootCache[folderPath] = root;
    } else {
      try {
        const gitRoot = await this.cmd.getRoot(folderPath);
        if (pathLib.isAbsolute(gitRoot)) {
          this.rootCache[folderPath] = gitRoot;
        } else {
          pathLib.join(folderPath, gitRoot);
        }
      } catch (error) {
        onError(error);
        return;
      }
    }
    return this.rootCache[folderPath];
  }

  async reload(folderPath: string, showIgnored: boolean) {
    const root = await this.getGitRoot(folderPath);
    if (root) {
      this.statusCache[root] = await this.cmd.status(root, showIgnored);
      this.directoryStatusCache[root] = {};

      // generate directory status
      Object.entries(this.statusCache[root]).forEach(([fullpath, status]) => {
        const relativePath = pathLib.relative(root, fullpath);
        const parts = relativePath.split(pathLib.sep);
        for (let i = 1; i <= parts.length; i++) {
          const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
          const cache = this.directoryStatusCache[root][frontalPath];
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
            this.directoryStatusCache[root][frontalPath] = {
              x: status.x,
              y: status.y,
            };
          }
        }
      });
    }
  }

  getStatus(path: string): GitDirectoryStatus | null {
    for (const [, directoryStatusCache] of Object.entries(this.directoryStatusCache)) {
      if (path in directoryStatusCache) {
        return directoryStatusCache[path];
      }
    }
    return null;
  }
}

export const gitManager = new GitManager();
