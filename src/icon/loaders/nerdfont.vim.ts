import { workspace } from 'coc.nvim';
import type { IconInternalLoadedItem, IconParsedTarget } from '../icons';
import { IconLoader, registerLoader } from '../loader';

export class NerdfontVimLoader extends IconLoader {
  async loadIcons(targets: IconParsedTarget[]) {
    const loaded: IconInternalLoadedItem[] = [];
    await Promise.all(
      targets.map(async (target) => {
        const code = await workspace.nvim.call('nerdfont#find', [
          target.fullname,
          target.isDirectory,
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

registerLoader('nerdfont.vim', () => new NerdfontVimLoader());
