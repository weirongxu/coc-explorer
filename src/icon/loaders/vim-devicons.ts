import { workspace } from 'coc.nvim';
import { IconInternalLoadedItem, IconParsedTarget } from '../icons';
import { IconLoader, registerLoader } from '../loader';

export class VimDeviconsLoader extends IconLoader {
  async loadIcons(targets: IconParsedTarget[]) {
    const loaded: IconInternalLoadedItem[] = [];
    await Promise.all(
      targets.map(async (target) => {
        if (target.isDirectory) {
          return;
        }
        const code = await workspace.nvim.call('WebDevIconsGetFileTypeSymbol', [
          target.fullname,
          false,
        ]);
        if (!code) {
          return;
        }
        loaded.push({
          target,
          icon: {
            code,
          },
        });
      }),
    );
    return loaded;
  }
}

registerLoader('vim-devicons', () => new VimDeviconsLoader());
