import { Emitter } from 'coc.nvim';
import commandExists from 'command-exists';
import pathLib from 'path';
import { config } from '../config';
import { execCmd, fsStat, normalizePath } from '../util';
import { GitFormat, GitStatus } from './types';

export namespace GitCommand {
  export type ShowUntrackedFiles = 'system' | boolean;

  export interface StatusOptions {
    /**
     * @default 'system'
     */
    showUntrackedFiles?: ShowUntrackedFiles;
    /**
     * @default false
     */
    showIgnored?: boolean;
  }
}

export class GitCommand {
  static get binPath() {
    return config.get<string>('git.command')!;
  }

  static available = false;

  private static loadedEmitter = new Emitter<void>();
  private static loaded = false;
  private static onLoaded = GitCommand.loadedEmitter.event;
  static async waitLoaded() {
    if (this.loaded) {
      return;
    }
    return new Promise((resolve) => {
      this.onLoaded(resolve);
    });
  }

  static async preload() {
    try {
      await commandExists(this.binPath);
      this.available = true;
    } catch (e) {
      this.available = false;
    } finally {
      this.loaded = true;
      this.loadedEmitter.fire();
    }
  }

  get binPath() {
    return GitCommand.binPath;
  }

  async available() {
    await GitCommand.waitLoaded();
    return GitCommand.available;
  }

  spawn(args: string[], { cwd }: { cwd?: string } = {}) {
    return execCmd(this.binPath, args, {
      cwd,
    });
  }

  async getRoot(filepath: string) {
    const stat = await fsStat(filepath).catch(() => undefined);
    const cwd = stat?.isDirectory() ? filepath : pathLib.dirname(filepath);
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
    {
      showUntrackedFiles = 'system',
      showIgnored = true,
    }: GitCommand.StatusOptions = {},
  ): Promise<Map<string, GitStatus>> {
    const gitStatus = new Map<string, GitStatus>();

    const args = ['status', '--porcelain'];
    if (showUntrackedFiles === true) {
      args.push('-u');
    } else if (showUntrackedFiles === false) {
      args.push('-uno');
    }
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
      gitStatus.set(fullpath, {
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
      });
    });

    return gitStatus;
  }

  async stage(paths: string[]) {
    if (paths.length) {
      const root = await this.getRoot(paths[0]);
      await this.spawn(['add', ...paths], { cwd: root });
    }
  }

  async unstage(paths: string[]) {
    if (paths.length) {
      const root = await this.getRoot(paths[0]);
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
    const count = await this.spawn(['rev-list', '--count', '@{upstream}..@'], {
      cwd: root,
    });
    return parseInt(count);
  }

  async hasStashed(root: string) {
    const list = await this.spawn(['stash', 'list'], {
      cwd: root,
    });
    return list.split(/\n/g).length - 1;
  }

  async checkIgnore(paths: string[]): Promise<string[]> {
    if (!paths.length) {
      return [];
    }
    const root = await this.getRoot(paths[0]);
    const output = await this.spawn(['check-ignore', ...paths], { cwd: root });
    return output.split(/\n/g);
  }
}
