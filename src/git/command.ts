import commandExists from 'command-exists';
import pathLib from 'path';
import { config } from '../config';
import { execCli, normalizePath } from '../util';
import { GitFormat, GitStatus } from './types';

export class GitCommand {
  get binPath() {
    return config.get<string>('git.command')!;
  }

  async available() {
    try {
      await commandExists(this.binPath);
      return true;
    } catch (e) {
      return false;
    }
  }

  spawn(args: string[], { cwd }: { cwd?: string } = {}) {
    return execCli(this.binPath, args, {
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
      if (!line) {
        return;
      }
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
      const staged = changedList.includes(x) && y === GitFormat.unmodified;
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

        staged,
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

  async fetch(root: string) {
    await this.spawn(['fetch'], { cwd: root });
  }

  async hasPull(root: string) {
    const count = await this.spawn(['rev-list', '--count', '@..@{upstream}'], {
      cwd: root,
    });
    return parseInt(count);
  }

  async hasPush(root: string) {
    const count = await this.spawn(['rev-list', '--count', '@{upstream}..@`'], {
      cwd: root,
    });
    return parseInt(count);
  }

  async hasStashed(root: string) {
    const list = await this.spawn(['stash', 'list'], {
      cwd: root,
    });
    return list.split(/\n/g).length;
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
