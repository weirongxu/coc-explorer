import { workspace } from 'coc.nvim';
import type { FileSource } from '../source/sources/file/fileSource';
import { logger } from '../util';
import { registerList } from './runner';

export const explorerWorkspaceFolderList = registerList<
  FileSource,
  { path: string; callback: () => void }
>({
  defaultAction: 'do',
  name: 'ExplorerWorkspaceFolders',
  async loadItems(fileSource) {
    return workspace.folderPaths.map((path) => ({
      label: path,
      data: {
        path,
        callback: () => {
          fileSource?.action.doAction('cd', [], [path]).catch(logger.error);
        },
      },
    }));
  },
  init() {
    this.addAction('do', ({ item }) => {
      item.data.callback();
    });
  },
  doHighlight() {
    const { nvim } = workspace;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerWorkspaceFolder /\\v^.*/', true);
    nvim.command(
      'highlight default link CocExplorerWorkspaceFolder PreProc',
      true,
    );
    nvim.resumeNotification().catch(logger.error);
  },
});
