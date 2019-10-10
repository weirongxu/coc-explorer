// modified from: https://github.com/neoclide/coc-lists/blob/3c117046b54130157006f8ddf048304507499260/src/files.ts

import { ChildProcess, spawn } from 'child_process';
import { BasicList, ListContext, ListTask, Neovim, Uri, workspace, ListItem } from 'coc.nvim';
import { EventEmitter } from 'events';
import minimatch from 'minimatch';
import path from 'path';
import readline from 'readline';
import { Location, Range } from 'vscode-languageserver-protocol';
import { executable, isWindows } from '../util';

class Task extends EventEmitter implements ListTask {
  private processes: ChildProcess[] = [];

  start(cmd: string, args: string[], cwds: string[], patterns: string[]): void {
    let remain = cwds.length;
    for (const cwd of cwds) {
      const process = spawn(cmd, args, { cwd });
      this.processes.push(process);
      process.on('error', (e) => {
        this.emit('error', e.message);
      });
      const rl = readline.createInterface(process.stdout);
      const range = Range.create(0, 0, 0, 0);
      const hasPattern = patterns.length > 0;
      process.stderr.on('data', (chunk) => {
        console.error(chunk.toString('utf8')); // tslint:disable-line
      });

      rl.on('line', (line) => {
        const file = path.join(cwd, line);
        if (hasPattern && patterns.some((p) => minimatch(file, p))) {
          return;
        }
        const location = Location.create(Uri.file(file).toString(), range);
        this.emit('data', {
          label: line,
          location,
        });
      });
      rl.on('close', () => {
        remain = remain - 1;
        if (remain == 0) {
          this.emit('end');
        }
      });
    }
  }

  dispose(): void {
    for (const process of this.processes) {
      if (!process.killed) {
        process.kill();
      }
    }
  }
}

export default class FilesList extends BasicList {
  readonly name = 'explorerFiles';
  readonly defaultAction = 'reveal';
  revealCallback?: (location: Location) => void | Promise<void>;
  rootPath?: string;
  recursive?: boolean;
  ignore?: boolean;

  constructor(nvim: Neovim) {
    super(nvim);
    this.addLocationActions();
    this.addAction('reveal', async (item) => {
      const loc = await this.convertLocation(item.location!);
      if (this.revealCallback) {
        this.revealCallback(loc);
      }
    });
  }

  async getCommand(): Promise<{ cmd: string; args: string[] }> {
    const args: string[] = [];
    if (await executable('fd')) {
      args.push('--color', 'never');
      if (!this.ignore) {
        args.push('--no-ignore');
      }
      if (!this.recursive) {
        args.push('--max-depth', '1');
      }
      return { cmd: 'fd', args };
    } else if (isWindows) {
      args.push('/a-D', '/B');
      if (this.recursive) {
        args.push('/S');
      }
      return { cmd: 'dir', args };
    } else if (executable('find')) {
      args.push('.');
      if (!this.recursive) {
        args.push('-maxdepth', '1');
      }
      return { cmd: 'find', args };
    } else {
      throw new Error('Unable to find command for files list.');
    }
  }

  async loadItems(_context: ListContext): Promise<ListItem[] | ListTask | null> {
    if (!this.rootPath) {
      return null;
    }
    const res = await this.getCommand();
    if (!res) {
      return null;
    }
    const task = new Task();
    const excludePatterns = this.getConfig().get<string[]>('excludePatterns', []);
    task.start(res.cmd, res.args, [this.rootPath], excludePatterns);
    return task;
  }
}

export const filesList = new FilesList(workspace.nvim);
