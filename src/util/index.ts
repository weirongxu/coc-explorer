import { workspace } from 'coc.nvim';
import util from 'util';

const { nvim } = workspace;

export const delay = (time: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

export const config = workspace.getConfiguration('explorer');

export const activeMode = config.get<boolean>('activeMode')!;

export const autoReveal = config.get<boolean>('file.autoReveal')!;

export const openStrategy = config.get<'vsplit' | 'previousBuffer' | 'select'>('openAction.strategy')!;

export const outputChannel = workspace.createOutputChannel('explorer');

export const sum = (list: number[]) => list.reduce((result, item) => result + item, 0);

export function supportBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}

let _supportSetbufline: boolean | null = null;
export async function supportSetbufline() {
  if (_supportSetbufline === null) {
    _supportSetbufline = Boolean(await nvim.call('exists', ['*setbufline']));
  }
  return _supportSetbufline;
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
  // tslint:disable-next-line: ban
  workspace.showMessage(util.inspect(data));
}
