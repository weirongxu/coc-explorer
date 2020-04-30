import { BasicList, Neovim, workspace } from 'coc.nvim';
import { onError } from '../logger';
import { FileSource } from '../source/sources/file/fileSource';

export class ExplorerWorkspaceFolderList extends BasicList {
  readonly defaultAction = 'do';
  readonly name = 'ExplorerWorkspaceFolders';
  private fileSource?: FileSource;

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('do', (item) => {
      item.data.callback();
    });
  }

  setFileSource(fileSource: FileSource) {
    this.fileSource = fileSource;
  }

  async loadItems() {
    return workspace.folderPaths.map((path) => ({
      label: path,
      data: {
        path,
        callback: () => {
          this.fileSource?.doAction('cd', [], [path]).catch(onError);
        },
      },
    }));
  }

  doHighlight() {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerWorkspaceFolder /\\v^.*/', true);
    nvim.command(
      'highlight default link CocExplorerWorkspaceFolder PreProc',
      true,
    );
    nvim.resumeNotification().catch(onError);
  }
}

export const explorerWorkspaceFolderList = new ExplorerWorkspaceFolderList(
  workspace.nvim,
);
