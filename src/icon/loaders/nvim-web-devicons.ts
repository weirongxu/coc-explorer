import { prettyPrint } from 'coc-helper';
import { workspace } from 'coc.nvim';
import { IconInternalLoadedItem, IconParsedTarget } from '../icons';
import { IconLoader, registerLoader } from '../loader';

export class NvimWebDeviconsLoader extends IconLoader {
  escapeLuaString(name: string, qoute: string = "'") {
    return name
      ? name.replace(/\\/g, '\\').replace(new RegExp(qoute, 'g'), "\\'")
      : name;
  }

  async loadIcons(targets: IconParsedTarget[]) {
    const loaded: IconInternalLoadedItem[] = [];
    await Promise.all(
      targets.map(async (target) => {
        const ext: string | undefined =
          target.extensions[target.extensions.length - 1];
        const result = (await workspace.nvim.call('luaeval', [
          "{require'nvim-web-devicons'.get_icon(_A[1], _A[2])}",
          [target.basename, ext],
        ])) as [] | [string, string];
        const [code, highlight] = result;
        if (!code) {
          return;
        }
        loaded.push({
          target,
          icon: {
            code,
            highlight,
          },
        });
      }),
    );
    return loaded;
  }
}

registerLoader('nvim-web-devicons', () => new NvimWebDeviconsLoader());
