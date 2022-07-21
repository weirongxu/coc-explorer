import { ExtensionContext } from 'coc.nvim';
import { ClipboardStorage, ClipboardContent } from './base';

export class GlobalStateStorage extends ClipboardStorage {
  context(): ExtensionContext {
    return this.explorerManager.context;
  }

  async setFiles(type: 'copy' | 'cut', fullpaths: string[]): Promise<void> {
    const newClip: ClipboardContent = {
      type,
      fullpaths,
    };
    if (newClip.fullpaths.length === 0) {
      await this.clear();
    } else {
      await this.context().globalState.update('clipboard', newClip);
    }
  }

  async getFiles(): Promise<ClipboardContent> {
    const content =
      this.context().globalState.get<ClipboardContent>('clipboard');
    if (!content)
      return {
        type: 'none',
        fullpaths: [],
      };
    return content;
  }

  async clear(): Promise<void> {
    await this.context().globalState.update('clipboard', undefined);
  }
}
