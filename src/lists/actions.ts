import { BasicList, Neovim, workspace, Mru } from 'coc.nvim';
import { onError } from '../util';

interface ActionData {
  name: string;
  score?: number;
  key?: string;
  description: string;
  callback: () => void | Promise<void>;
}

function score(list: string[], key: string): number {
  const idx = list.indexOf(key);
  return idx === -1 ? -1 : list.length - idx;
}

export const actionListMru = new Mru('explorer-actions');

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
        await actionListMru.add(data.name);
        resolve(undefined);
      }).catch(onError);
    });
  }

  setExplorerActions(actions: ActionData[]) {
    this.explorerActions = actions;
  }

  async loadItems() {
    const mruList = await actionListMru.load();
    const items = this.explorerActions.map((actionData) => ({
      label: `${actionData.name} [${actionData.key || ''}] ${
        actionData.description
      }`,
      data: {
        ...actionData,
        score: score(mruList, actionData.name),
      },
    }));
    items.sort((a, b) => b.data.score - a.data.score);
    return items;
  }

  doHighlight() {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command(
      'syntax match CocExplorerActionName /\\v^[a-zA-Z0-9:|<>]+/',
      true,
    );
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
