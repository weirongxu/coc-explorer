import { workspace } from 'coc.nvim';
import util from 'util';
export * from './string';
export * from './number';
export * from './array';
export * from './async';
export * from './config';
export * from './events';
export * from './fs';
export * from './neovim-notify';
export * from './throttle-debounce';
export * from './vim';
export * from './platform';
export * from './cli';

export const outputChannel = workspace.createOutputChannel('explorer');

export function prettyPrint(data: any) {
  // tslint:disable-next-line: ban
  workspace.showMessage(util.inspect(data));
}
