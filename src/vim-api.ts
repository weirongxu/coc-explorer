import { ExtensionContext, commands, workspace } from 'coc.nvim';
import { ActionMode, parseAction } from './mappings';
import { ExplorerManager } from './explorer-manager';
import { getFileIcon, getDirectoryIcon } from './icons';
import pathLib from 'path';
import { Explorer } from './explorer';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { compactI, asyncCatchError } from './util';
import { WinLayoutFinder } from './win-layout-finder';

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
) {
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
    return node ? explorerManager.explorerByWinid(node.winid) : undefined;
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
): Promise<number | null> {
  if (position === 'current') {
    return ((await workspace.nvim.call('line', ['.'])) as number) - 1;
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
  return null;
}

async function getSourceAndNodeByPosition(
  position: Position,
  explorer: Explorer,
): Promise<[null, null] | [ExplorerSource<any>, null | BaseTreeNode<any>]> {
  const lineIndex = await getLineIndexByPosition(position, explorer);
  if (!lineIndex) {
    return [null, null];
  }
  const source = explorer.sources.find(
    (source) =>
      lineIndex >= source.startLineIndex && lineIndex < source.endLineIndex,
  );
  if (!source) {
    return [null, null];
  }
  const nodeIndex = lineIndex - source.startLineIndex;
  return [source, source.flattenedNodes[nodeIndex] ?? null];
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
        actions: string[],
        positions: Position[] = ['current'],
        mode: ActionMode = 'n',
        count: number = 1,
      ) => {
        const explorer = await getExplorer(explorerFinder, explorerManager);
        if (!explorer) {
          return;
        }
        const lines = compactI(
          await Promise.all(
            positions.map(
              async (position) =>
                await getLineIndexByPosition(position, explorer),
            ),
          ),
        );
        return explorer.doActionsWithCount(
          actions.map((action) => parseAction(action)),
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
          return null;
        }
        const [, node] = await getSourceAndNodeByPosition(position, explorer);
        if (!node) {
          return null;
        }
        return {
          ...node,
          parent: null,
          children: null,
          prevSiblingNode: null,
          nextSiblingNode: null,
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
