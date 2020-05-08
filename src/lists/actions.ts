import { BasicList, Neovim, workspace } from 'coc.nvim';
import { onError } from '../logger';

interface ActionData {
  name: string;
  key?: string;
  description: string;
  callback: () => void | Promise<void>;
}

export class ExplorerActionList extends BasicList {
  readonly defaultAction = 'do';
  readonly name = 'explorerActions';
  private explorerActions: ActionData[] = [];

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('do', (item) => {
      new Promise(async (resolve) => {
        const data = item.data as ActionData;
        await data.callback();
        resolve();
      }).catch(onError);
    });
  }

  setExplorerActions(actions: ActionData[]) {
    this.explorerActions = actions;
  }

  async loadItems() {
    return this.explorerActions.map((actionData) => ({
      label: `${actionData.name} [${actionData.key || ''}] ${
        actionData.description
      }`,
      data: actionData,
    }));
  }

  doHighlight() {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerActionName /\\v^(\\w|:)+/', true);
    nvim.command('syntax match CocExplorerActionKey /\\v\\[.*\\]/', true);
    nvim.command(
      'syntax match CocExplorerActionDescription /\\v\\] \\zs.*/',
      true,
    );
    nvim.command('highlight default link CocExplorerActionName PreProc', true);
    nvim.command(
      'highlight default link CocExplorerActionKey Identifier',
      true,
    );
    nvim.command(
      'highlight default link CocExplorerActionDescription Comment',
      true,
    );
    nvim.resumeNotification().catch(onError);
  }
}

export const explorerActionList = new ExplorerActionList(workspace.nvim);
