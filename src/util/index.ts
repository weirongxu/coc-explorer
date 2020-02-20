import { workspace } from 'coc.nvim';
import util from 'util';
export * from './string';
export * from './number';
export * from './array';
export * from './async';
export * from './config';
export * from './events';
export * from './fs';
export * from './path';
export * from './neovim-notify';
export * from './throttle-debounce';
export * from './vim';
export * from './platform';
export * from './cli';
export * from './function';

export const outputChannel = workspace.createOutputChannel('explorer');

export function prettyPrint(...data: any[]) {
  let s = '';
  for (const d of data) {
    s += typeof d === 'string' ? d : util.inspect(d);
  }
  // tslint:disable-next-line: ban
  workspace.showMessage(s);
}
