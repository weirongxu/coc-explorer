import { workspace } from 'coc.nvim';
import util from 'util';
import { format } from 'date-fns';
export * from './string';
export * from './symbol';
export * from './number';
export * from './collection';
export * from './async';
export * from './fs';
export * from './path';
export * from './neovimNotify';
export * from './throttleDebounce';
export * from './vim';
export * from './ui';
export * from './platform';
export * from './cli';
export * from './function';
export * from './uri';
export * from './painter';

export const outputChannel = workspace.createOutputChannel('explorer');

export function prettyPrint(...data: any[]) {
  let s = `[${format(new Date(), 'yy/MM/dd HH:mm:ss.SSS')}]`;
  for (const d of data) {
    s += ' ' + util.inspect(d);
  }
  // eslint-disable-next-line no-restricted-properties
  workspace.showMessage(s);
}
