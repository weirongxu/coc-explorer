import { workspace } from 'coc.nvim';
import type { IconInternalLoadedItem, IconParsedTarget } from '../icons';
import { IconLoader, registerLoader } from '../loader';

export class NvimWebDeviconsLoader extends IconLoader {
  escapeLuaString(name: string, qoute = "'") {
    return name
      ? name.replace(/\\/g, '\\').replace(new RegExp(qoute, 'g'), "\\'")
      : name;
  }

  async loadIcons(targets: IconParsedTarget[]) {
    const loaded: IconInternalLoadedItem[] = [];

    for (const target of targets) {
      if (target.isDirectory) {
        continue;
      }
      const ext: string | undefined =
        target.extensions[target.extensions.length - 1];
      // Note: nvim-web-devicons.get_icon not support the concurrent invoke.
      // https://github.com/weirongxu/coc-explorer/issues/485
      const result = (await workspace.nvim.call('luaeval', [
        "{require'nvim-web-devicons'.get_icon(_A[1], _A[2])}",
        [target.fullname, ext],
      ])) as [] | [string, string];
      const [code, highlight] = result;
      if (!code) {
        continue;
      }
      loaded.push({
        target,
        icon: {
          code,
          highlight,
        },
      });
    }

    return loaded;
  }
}

registerLoader('nvim-web-devicons', () => new NvimWebDeviconsLoader());
