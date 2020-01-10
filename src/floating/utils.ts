import { workspace } from 'coc.nvim';

export function floatSupported(): boolean {
  // @ts-ignore
  return workspace.floatSupported;
}
