import { BasicList, Neovim, workspace } from 'coc.nvim';
import { FileSource } from '../source/sources/file/fileSource';
import {logger} from '../util';

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
          this.fileSource?.action.doAction('cd', [], [path]).catch(logger.error);
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
    nvim.resumeNotification().catch(logger.error);
  }
}

export const explorerWorkspaceFolderList = new ExplorerWorkspaceFolderList(
  workspace.nvim,
);
