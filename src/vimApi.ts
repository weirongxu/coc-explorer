import { commands, ExtensionContext, workspace } from 'coc.nvim';
import pathLib from 'path';
import { MappingMode, OriginalActionExp } from './actions/types';
import { Explorer } from './explorer';
import { ExplorerManager } from './explorerManager';
import { IconInfo, IconTarget, loadIcons } from './icon/icons';
import { actionListMru } from './lists/actions';
import { parseOriginalActionExp } from './mappings';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { compactI, logger } from './util';
import { WinLayoutFinder } from './winLayoutFinder';

export function registerApi(
  id: string,
  execute: (...args: any[]) => Promise<any>,
) {
  return commands.registerCommand(
    id,
    logger.asyncCatch(execute),
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
    const curWinid = (await workspace.nvim.eval(
      'win_getid(winnr())',
    )) as number;
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
    return explorer.view.currentLineIndex;
  } else if (typeof position === 'number') {
    return position;
  } else if (Array.isArray(position)) {
    const [mode, lineIndex, type] = position;
    if (mode === 'relative') {
      const source = type
        ? explorer.sources.find((s) => s.sourceType === type)
        : await explorer.view.currentSource();
      if (source) {
        return source.view.startLineIndex + lineIndex;
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
      lineIndex >= source.view.startLineIndex &&
      lineIndex < source.view.endLineIndex,
  );
  if (!source) {
    return [undefined, undefined];
  }
  const nodeIndex = lineIndex - source.view.startLineIndex;
  return [source, source.view.flattenedNodes[nodeIndex] ?? undefined];
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
    await explorer.view.refreshLineIndex();
    const lineIndexes = compactI(
      await Promise.all(
        positions.map(
          async (position) => await getLineIndexByPosition(position, explorer),
        ),
      ),
    );
    await explorer.action
      .doActionExp(parseOriginalActionExp(actionExp), {
        mode,
        count,
        lineIndexes,
      })
      .catch(logger.error);
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
        await explorer.view.refreshLineIndex();
        const [, node] = await getSourceAndNodeByPosition(position, explorer);
        if (!node) {
          return undefined;
        }
        return {
          ...node,
          compactedNodes: undefined,
          parent: undefined,
          children: undefined,
          prevSiblingNode: undefined,
          nextSiblingNode: undefined,
        };
      },
    ),
    registerApi(
      'explorer.getIcon',
      async (
        filepath: string,
        isDirectory: boolean = false,
        isExpanded?: boolean,
      ) => {
        const basename = pathLib.basename(filepath);
        const type = isDirectory
          ? ('directories' as const)
          : ('files' as const);
        const nodes: IconTarget[] = [
          {
            fullname: basename,
            isDirectory,
            expanded: isExpanded,
            hidden: false,
          },
        ];
        const icons = await loadIcons('builtin', nodes);
        return icons?.[type].get(basename);
      },
    ),
    registerApi(
      'explorer.getIcons',
      async (
        paths: {
          filepath: string;
          isDirectory: boolean;
          isExpanded?: boolean;
        }[],
      ) => {
        const fullname2filepath: Record<string, string> = {};
        const targets: IconTarget[] = paths.map((it) => {
          const fullname = pathLib.basename(it.filepath);
          fullname2filepath[fullname] = it.filepath;
          return {
            fullname,
            isDirectory: it.isDirectory,
            expanded: it.isExpanded,
            hidden: false,
          };
        });
        const icons = await loadIcons('builtin', targets);
        if (!icons) {
          return;
        }
        // convert the key from fullname to filepath
        const result: {
          files: Record<string, IconInfo>;
          directories: Record<string, IconInfo>;
        } = {
          files: {},
          directories: {},
        };
        for (const [fullname, file] of icons.files) {
          result.files[fullname2filepath[fullname]] = file;
        }
        for (const [fullname, directory] of icons.directories) {
          result.directories[fullname2filepath[fullname]] = directory;
        }
        return result;
      },
    ),
  );
}
