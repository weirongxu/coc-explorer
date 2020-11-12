import { commands, ExtensionContext, workspace } from 'coc.nvim';
import pathLib from 'path';
import { MappingMode, OriginalActionExp } from './actions/types';
import { Explorer } from './explorer';
import { ExplorerManager } from './explorerManager';
import { getDirectoryIcon, getFileIcon } from './icons';
import { actionListMru } from './lists/actions';
import { parseOriginalActionExp } from './mappings';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { asyncCatchError, compactI, onError } from './util';
import { WinLayoutFinder } from './winLayoutFinder';

export function registerApi(
  id: string,
  execute: (...args: any[]) => Promise<any>,
) {
  return commands.registerCommand(
    id,
    asyncCatchError(execute),
    undefined,
    true,
  );
}

type ExplorerFinder = number | 'closest';

async function getExplorer(
  explorerFinder: ExplorerFinder,
  explorerManager: ExplorerManager,
): Promise<undefined | Explorer> {
  if (explorerFinder === 'closest') {
    const winFinder = await WinLayoutFinder.create();
    const curWinid = (await workspace.nvim.call('bufwinid', [
      workspace.bufnr,
    ])) as number;
    if (curWinid <= -1) {
      return;
    }
    const curNode = winFinder.findWinid(curWinid);
    if (!curNode) {
      return;
    }
    const winids = await explorerManager.winids();
    if (!winids.length) {
      return;
    }
    const node = winFinder.findClosest(curNode, winids);
    if (node) {
      return explorerManager.explorerByWinid(node.winid);
    } else {
      const current = await explorerManager.currentTabContainer();
      const explorer = current?.floating;
      if ((await explorer?.winnr) !== undefined) {
        return explorer;
      }
    }
  } else {
    return explorerFinder === 0
      ? explorerManager.currentExplorer()
      : explorerManager.explorerByBufnr(explorerFinder);
  }
}

type Position = 'current' | number | ['relative', number, string?];

async function getLineIndexByPosition(
  position: Position,
  explorer: Explorer,
): Promise<number | undefined> {
  if (position === 'current') {
    return explorer.currentLineIndex;
  } else if (typeof position === 'number') {
    return position;
  } else if (Array.isArray(position)) {
    const [mode, lineIndex, type] = position;
    if (mode === 'relative') {
      const source = type
        ? explorer.sources.find((s) => s.sourceType === type)
        : await explorer.currentSource();
      if (source) {
        return source.startLineIndex + lineIndex;
      }
    }
  }
  return;
}

async function getSourceAndNodeByPosition(
  position: Position,
  explorer: Explorer,
): Promise<
  [undefined, undefined] | [ExplorerSource<any>, undefined | BaseTreeNode<any>]
> {
  const lineIndex = await getLineIndexByPosition(position, explorer);
  if (!lineIndex) {
    return [undefined, undefined];
  }
  const source = explorer.sources.find(
    (source) =>
      lineIndex >= source.startLineIndex && lineIndex < source.endLineIndex,
  );
  if (!source) {
    return [undefined, undefined];
  }
  const nodeIndex = lineIndex - source.startLineIndex;
  return [source, source.flattenedNodes[nodeIndex] ?? undefined];
}

export function registerVimApi(
  context: ExtensionContext,
  explorerManager: ExplorerManager,
) {
  async function doAction(
    explorerFinder: ExplorerFinder,
    actionExp: OriginalActionExp,
    positions: Position[] = ['current'],
    mode: MappingMode = 'n',
    count: number = 1,
  ) {
    const explorer = await getExplorer(explorerFinder, explorerManager);
    if (!explorer) {
      return;
    }
    await explorer.refreshLineIndex();
    const lineIndexes = compactI(
      await Promise.all(
        positions.map(
          async (position) => await getLineIndexByPosition(position, explorer),
        ),
      ),
    );
    await explorer
      .doActionExp(parseOriginalActionExp(actionExp), {
        mode,
        count,
        lineIndexes,
        queue: true,
      })
      .catch(onError);
  }

  context.subscriptions.push(
    registerApi('explorer.doAction', doAction),
    registerApi(
      'explorer.doCodeAction',
      async (
        name: string,
        action: string,
        getArgs: () => Promise<string[]>,
      ) => {
        const result = await doAction(0, {
          name: action,
          args: await getArgs(),
        });
        await actionListMru.add(name);
        return result;
      },
    ),
    registerApi(
      'explorer.getNodeInfo',
      async (
        explorerFinder: ExplorerFinder,
        position: Position = 'current',
      ) => {
        const explorer = await getExplorer(explorerFinder, explorerManager);
        if (!explorer) {
          return undefined;
        }
        await explorer.refreshLineIndex();
        const [, node] = await getSourceAndNodeByPosition(position, explorer);
        if (!node) {
          return undefined;
        }
        return {
          ...node,
          parent: undefined,
          children: undefined,
          prevSiblingNode: undefined,
          nextSiblingNode: undefined,
        };
      },
    ),
    registerApi(
      'explorer.getIcon',
      async (filepath: string, isDirectory: boolean = false) => {
        const basename = pathLib.basename(filepath);
        return isDirectory ? getDirectoryIcon(basename) : getFileIcon(basename);
      },
    ),
  );
}
