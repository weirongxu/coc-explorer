import { BasicList, Neovim, workspace } from 'coc.nvim';
import { onError } from '../logger';

interface Action {
  name: string;
  nodes: any[] | null;
  key?: string;
  root: boolean;
  description: string;
  callback: (node: any, arg: string) => void | Promise<void>;
}

export class ExplorerActionList extends BasicList {
  readonly defaultAction = 'do';
  readonly name = 'explorerActions';
  private explorerActions: Action[] = [];

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('do', (item) => {
      new Promise(async (resolve) => {
        if (item.data.root) {
          await item.data.callback();
        } else {
          await item.data.callback(item.data.nodes);
        }
        resolve();
      }).catch(onError);
    });
  }

  setExplorerActions(actions: Action[]) {
    this.explorerActions = actions;
  }

  async loadItems() {
    return this.explorerActions.map((action) => ({
      label: `${action.name} [${action.key || ''}] ${action.description}`,
      data: {
        root: action.root,
        callback: action.callback,
        nodes: action.nodes,
      },
    }));
  }

  doHighlight() {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerActionName /\\v^\\w+/', true);
    nvim.command('syntax match CocExplorerActionKey /\\v\\[.*\\]/', true);
    nvim.command('syntax match CocExplorerActionDescription /\\v\\] \\zs.*/', true);
    nvim.command('highlight default link CocExplorerActionName PreProc', true);
    nvim.command('highlight default link CocExplorerActionKey Identifier', true);
    nvim.command('highlight default link CocExplorerActionDescription Comment', true);
    nvim.resumeNotification().catch(onError);
  }
}

export const explorerActionList = new ExplorerActionList(workspace.nvim);
