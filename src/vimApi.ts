import { ExtensionContext, commands, workspace } from 'coc.nvim';
import { MappingMode, parseActionExp } from './mappings';
import { ExplorerManager } from './explorerManager';
import { getFileIcon, getDirectoryIcon } from './icons';
import pathLib from 'path';
import { Explorer } from './explorer';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { compactI, asyncCatchError } from './util';
import { WinLayoutFinder } from './winLayoutFinder';
import { OriginalActionExp } from './actions/mapping';

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
  const { nvim } = workspace;

  context.subscriptions.push(
    registerApi(
      'explorer.doAction',
      async (
        explorerFinder: ExplorerFinder,
        actionExp: OriginalActionExp,
        positions: Position[] = ['current'],
        mode: MappingMode = 'n',
        count: number = 1,
      ) => {
        const explorer = await getExplorer(explorerFinder, explorerManager);
        if (!explorer) {
          return;
        }
        await explorer.refreshLineIndex();
        const lines = compactI(
          await Promise.all(
            positions.map(
              async (position) =>
                await getLineIndexByPosition(position, explorer),
            ),
          ),
        );
        return explorer.doActionsWithCount(
          parseActionExp(actionExp),
          mode,
          count,
          lines,
        );
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
