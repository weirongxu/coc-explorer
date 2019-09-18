import { workspace } from 'coc.nvim';

const { nvim } = workspace;

let _supportSetbufline: boolean | null = null;
export async function supportSetbufline() {
  if (_supportSetbufline === null) {
    _supportSetbufline = Boolean(await nvim.call('exists', ['*setbufline']));
  }
  return _supportSetbufline;
}

export function supportBufferHighlight() {
  return !workspace.env.isVim || workspace.env.textprop;
}
