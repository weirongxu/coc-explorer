import { ExtensionContext } from 'coc.nvim';
import { ClipboardStorage, ClipboardContent } from './base';

export class GlobalStateStorage extends ClipboardStorage {
  context(): ExtensionContext {
    return this.explorerManager.context;
  }

  async copyFiles(fullpaths: string[]): Promise<void> {
    const content: ClipboardContent = {
      type: 'copy',
      fullpaths,
    };
    await this.context().globalState.update('clipboard', content);
  }

  async cutFiles(fullpaths: string[]): Promise<void> {
    const content: ClipboardContent = {
      type: 'cut',
      fullpaths,
    };
    await this.context().globalState.update('clipboard', content);
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
