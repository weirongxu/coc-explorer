import { CodeActionProvider } from 'coc.nvim';
import {
  TextDocument,
  Range,
  CodeActionContext,
  CancellationToken,
  Command,
} from 'vscode-languageserver-protocol';
import { ExplorerManager } from './explorerManager';
import { flatten } from './util';
import { getReverseMappings } from './mappings';
import { RegisteredAction } from './actions/registered';
import { actionListMru } from './lists/actions';

function score(list: string[], key: string): number {
  const idx = list.indexOf(key);
  return idx === -1 ? -1 : list.length - idx;
}

export class ActionMenuCodeActionProvider implements CodeActionProvider {
  constructor(public explorerManager: ExplorerManager) {}

  async provideCodeActions(
    _document: TextDocument,
    _range: Range,
    _context: CodeActionContext,
    _token: CancellationToken,
  ): Promise<Command[]> {
    const explorer = this.explorerManager.currentExplorer();
    if (!explorer) {
      return [];
    }
    const source = await explorer.currentSource();
    if (!source) {
      return [];
    }

    const reverseMappings = await getReverseMappings();
    const actions = {
      ...explorer.globalActions,
      ...source.actions,
    };
    const mruList = await actionListMru.load();

    return flatten(
      Object.entries(actions)
        .filter(([actionName]) => actionName !== 'actionMenu')
        .sort(([aName], [bName]) => aName.localeCompare(bName))
        .sort(([aName], [bName]) => aName.localeCompare(bName))
        .map(([actionName, { options }]) => {
          const list = [
            {
              title: `${actionName} [${reverseMappings[actionName] ?? ''}]`,
              name: actionName,
              command: 'explorer.doCodeAction',
              arguments: [actionName, actionName, async () => []] as [
                string,
                string,
                () => Promise<string[]>,
              ],
              score: score(mruList, actionName),
            },
          ];
          if (options.menus) {
            list.push(
              ...RegisteredAction.getNormalizeMenus(options.menus).map(
                (menu) => {
                  const fullActionName = actionName + ':' + menu.args;
                  return {
                    title: `${fullActionName} [${
                      reverseMappings[fullActionName] ?? ''
                    }]`,
                    name: fullActionName,
                    command: 'explorer.doCodeAction',
                    arguments: [
                      fullActionName,
                      actionName,
                      () => menu.actionArgs(),
                    ] as [string, string, () => Promise<string[]>],
                    score: score(mruList, fullActionName),
                  };
                },
              ),
            );
          }
          return list;
        }),
    ).sort((a, b) => b.score - a.score);
  }
}
