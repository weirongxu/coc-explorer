import { workspace } from 'coc.nvim';
import pathLib from 'path';
import { spawn } from 'child_process';
import { onError } from './logger';
import util from 'util';

export const delay = (time: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

export const config = workspace.getConfiguration('explorer');

export const openStrategy = config.get<'vsplit' | 'previousBuffer' | 'select'>('openAction.strategy')!;

export const activeMode = config.get<boolean>('activeMode')!;

export const outputChannel = workspace.createOutputChannel('explorer');

export const sum = (list: number[]) => list.reduce((result, item) => result + item, 0);

export function supportBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}

export const chunk = <T>(array: T[], size: number = 1): T[][] => {
  const finalSize = Math.max(size, 0);
  if (!array.length || size < 1) {
    return [];
  }
  const result: T[][] = [];
  for (let i = 0; i < Math.ceil(array.length / finalSize); i++) {
    result.push(array.slice(i * size, (i + 1) * size));
  }
  return result;
};

export function byteIndex(content: string, index: number): number {
  const s = content.slice(0, index);
  return Buffer.byteLength(s);
}

export function byteLength(str: string): number {
  return Buffer.byteLength(str);
}

export function gitCommand(args: string[], { cwd }: { cwd?: string } = {}) {
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

const gitRootCache: Record<string, string> = {};
async function fetchGitRoot(cwd: string) {
  const output = await gitCommand(['rev-parse', '--show-toplevel'], {
    cwd,
  });
  return output.trim();
}
export async function getGitRoot(path: string): Promise<string | undefined> {
  if (path in gitRootCache) {
    return gitRootCache[path];
  }

  const parts = path.split(pathLib.sep);
  const idx = parts.indexOf('.git');
  if (idx !== -1) {
    const root = parts.slice(0, idx).join(pathLib.sep);
    gitRootCache[path] = root;
  } else {
    try {
      const gitRoot = await fetchGitRoot(path);
      if (pathLib.isAbsolute(gitRoot)) {
        gitRootCache[path] = gitRoot;
      } else {
        pathLib.join(path, gitRoot);
      }
    } catch (error) {
      onError(error);
      return;
    }
  }
  return gitRootCache[path];
}

export function truncate(name: string, width: number, padSide: 'start' | 'end') {
  if (name.length > width) {
    const truncWidth = name.length - width + 2;
    const truncRight = Math.floor(truncWidth / 2);
    const truncLeft = truncWidth % 2 ? truncRight + 1 : truncRight;
    const leftName = name.slice(0, Math.floor(name.length / 2) - truncLeft);
    const rightName = name.slice(Math.floor(name.length / 2) + truncRight);
    return leftName + '..' + rightName;
  } else {
    if (padSide === 'start') {
      return name.padStart(width, ' ');
    } else {
      return name.padEnd(width, ' ');
    }
  }
}

export function prettyPrint(data: any) {
  workspace.showMessage(util.inspect(data));
}
