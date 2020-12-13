import { CodeActionProvider } from 'coc.nvim';
import {
  CancellationToken,
  CodeActionContext,
  Command,
  Range,
} from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ActionMenu } from './menu';
import { ExplorerManager } from '../explorerManager';
import { actionListMru } from '../lists/actions';
import { keyMapping } from '../mappings';
import { flatten } from '../util';

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

    const reverseMappings = await keyMapping.getReversedMappings(
      source.sourceType,
    );
    const actions = source.action.registeredActions();
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
              ...ActionMenu.getNormalizeMenus(options.menus).map((menu) => {
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
              }),
            );
          }
          return list;
        }),
    ).sort((a, b) => b.score - a.score);
  }
}
