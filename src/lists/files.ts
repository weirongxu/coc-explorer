// modified from: https://github.com/neoclide/coc-lists/blob/3c117046b54130157006f8ddf048304507499260/src/files.ts

import { ChildProcess, spawn } from 'child_process';
import { ListTask, Location, Range, Uri, workspace } from 'coc.nvim';
import { EventEmitter } from 'events';
import minimatch from 'minimatch';
import pathLib from 'path';
import readline from 'readline';
import { executable, isWindows } from '../util';
import { registerList } from './runner';

class Task extends EventEmitter implements ListTask {
  private processes: ChildProcess[] = [];

  start(
    cmd: string,
    args: string[],
    cwds: string[],
    excludePatterns: string[],
  ): void {
    let remain = cwds.length;
    for (const cwd of cwds) {
      const process = spawn(cmd, args, { cwd });
      this.processes.push(process);
      process.on('error', (e) => {
        this.emit('error', e.message);
      });
      const rl = readline.createInterface(process.stdout);
      const range = Range.create(0, 0, 0, 0);
      const hasPattern = excludePatterns.length > 0;
      process.stderr.on('data', (chunk) => {
        // eslint-disable-next-line no-console
        console.error(chunk.toString('utf8'));
      });

      rl.on('line', (line) => {
        const file = pathLib.join(cwd, line);
        if (hasPattern && excludePatterns.some((p) => minimatch(file, p))) {
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
        if (remain === 0) {
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

const config = workspace.getConfiguration('list.source.files');

type Arg = {
  revealCallback?: (location: Location) => void | Promise<void>;
  rootPath?: string;
  recursive: boolean;
  showIgnores: boolean;
  showHidden: boolean;
};

async function getCommand(arg: Arg): Promise<{ name: string; args: string[] }> {
  const args: string[] = [];
  if (await executable('fd')) {
    args.push('--color', 'never');
    if (arg.showIgnores) {
      args.push('--no-ignore');
    }
    if (arg.showHidden) {
      args.push('--hidden');
    }
    if (!arg.recursive) {
      args.push('--max-depth', '1');
    }
    return { name: 'fd', args };
  } else if (isWindows) {
    args.push('/a-D', '/B');
    if (arg.recursive) {
      args.push('/S');
    }
    return { name: 'dir', args };
  } else if (await executable('find')) {
    args.push('.');
    if (!arg.recursive) {
      args.push('-maxdepth', '1');
    }
    return { name: 'find', args };
  } else {
    throw new Error('Unable to find command for files list.');
  }
}

export const fileList = registerList<Arg, any>({
  name: 'explorerFiles',
  defaultAction: 'reveal',
  async loadItems(arg) {
    if (!arg.rootPath) {
      return;
    }
    const cmd = await getCommand(arg);
    if (!cmd) {
      return;
    }
    const task = new Task();
    const excludePatterns = config.get<string[]>('excludePatterns', []);
    task.start(cmd.name, cmd.args, [arg.rootPath], excludePatterns);
    return task;
  },
  init() {
    this.addLocationActions();
    this.addAction('reveal', async ({ arg, item }) => {
      const loc = await this.convertLocation(item.location!);
      if (arg.revealCallback) {
        await arg.revealCallback(loc);
      }
    });
  },
});
