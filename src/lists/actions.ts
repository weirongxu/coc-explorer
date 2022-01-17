import { workspace } from 'coc.nvim';
import { logger } from '../util';
import { registerList } from './runner';

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

export const actionListMru = workspace.createMru('explorer-actions');

export const explorerActionList = registerList<ActionData[], ActionData>({
  name: 'explorerActionList',
  defaultAction: 'do',
  async loadItems(actions) {
    const mruList = await actionListMru.load();
    const items = actions.map((actionData) => ({
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
  },
  doHighlight() {
    const { nvim } = workspace;
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
    nvim.resumeNotification().catch(logger.error);
  },
  init() {
    this.addAction('do', ({ item }) => {
      logger.asyncCatch(async () => {
        const data = item.data;
        await data.callback();
        await actionListMru.add(data.name);
      })();
    });
  },
});
