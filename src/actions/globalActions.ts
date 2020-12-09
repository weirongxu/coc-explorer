import { WinLayoutFinder } from 'coc-helper';
import { workspace } from 'coc.nvim';
import { argOptions } from '../argOptions';
import type { Explorer } from '../explorer';
import { parseOriginalActionExp } from '../mappings';
import { ArgPosition } from '../parseArgs';
import { BaseTreeNode } from '../source/source';
import {
  MoveStrategy,
  moveStrategyList,
  OpenStrategy,
  openStrategyList,
  PreviewOnHoverAction,
  previewOnHoverActionList,
  previewStrategyList,
} from '../types';
import { PreviewActionStrategy } from '../types/pkg-config';
import { enableWrapscan } from '../util';

async function openAction(
  explorer: Explorer,
  node: BaseTreeNode<any>,
  getFullpath: () => string | Promise<string>,
  {
    openByWinnr: originalOpenByWinnr,
    args = [],
    position,
  }: {
    openByWinnr?: (winnr: number) => void | Promise<void>;
    args?: string[];
    position?: {
      lineIndex: number;
      columnIndex?: number;
    };
  },
) {
  if (node.expandable) {
    return;
  }

  const { nvim } = workspace;

  const getEscapePath = async () => {
    let path = await getFullpath();
    if (explorer.config.get('openAction.relativePath')) {
      path = await nvim.call('fnamemodify', [path, ':.']);
    }
    return await nvim.call('fnameescape', [path]);
  };

  const jumpToNotify = () => {
    if (position) {
      nvim.call(
        'cursor',
        [position.lineIndex + 1, (position.columnIndex ?? 0) + 1],
        true,
      );
    }
  };

  const openByWinnr =
    originalOpenByWinnr ??
    (async (winnr: number) => {
      nvim.pauseNotification();
      nvim.command(`${winnr}wincmd w`, true);
      nvim.command(`edit ${await getEscapePath()}`, true);
      jumpToNotify();
      if (workspace.isVim) {
        // Avoid vim highlight not working,
        // https://github.com/weirongxu/coc-explorer/issues/113
        nvim.command('redraw', true);
      }
      (await explorer.tryQuitOnOpenNotifier()).notify();
      await nvim.resumeNotification();
    });

  const splitIntelligent = async (
    position: ArgPosition,
    command: 'split' | 'vsplit',
    fallbackStrategy: OpenStrategy,
  ) => {
    const explWinid = await explorer.winid;
    if (!explWinid) {
      return;
    }

    const winFinder = await WinLayoutFinder.create();
    const node = winFinder.findWinid(explWinid);
    if (node) {
      if (node.parent && node.parent.group.type === 'row') {
        const target =
          node.parent.group.children[
            node.parent.indexInParent + (position === 'left' ? 1 : -1)
          ];
        if (target) {
          const targetWinid = WinLayoutFinder.getFirstLeafWinid(target);

          nvim.pauseNotification();
          nvim.call('win_gotoid', [targetWinid], true);
          nvim.command(`${command} ${await getEscapePath()}`, true);
          jumpToNotify();
          (await explorer.tryQuitOnOpenNotifier()).notify();
          await nvim.resumeNotification();
        }
      } else {
        // only exlorer window or explorer is arranged in columns
        await actions['vsplit:plain']();
      }
    } else {
      // floating
      await actions[fallbackStrategy]();
    }
  };

  const actions: Record<OpenStrategy, () => void | Promise<void>> = {
    select: async () => {
      const position = await explorer.args.value(argOptions.position);
      if (position === 'floating') {
        await explorer.hide();
      }
      await explorer.selectWindowsUI(
        async (winnr) => {
          await openByWinnr(winnr);
        },
        async () => {
          await actions.vsplit();
        },
        async () => {
          if (position === 'floating') {
            await explorer.show();
          }
        },
      );
    },

    split: () => actions['split:intelligent'](),
    'split:plain': async () => {
      nvim.pauseNotification();
      nvim.command(`split ${await getEscapePath()}`, true);
      jumpToNotify();
      (await explorer.tryQuitOnOpenNotifier()).notify();
      await nvim.resumeNotification();
    },

    'split:intelligent': async () => {
      const position = await explorer.args.value(argOptions.position);
      if (position === 'floating') {
        await actions['split:plain']();
        return;
      } else if (position === 'tab') {
        await actions.vsplit();
        return;
      }
      await splitIntelligent(position, 'split', 'split:plain');
    },

    vsplit: () => actions['vsplit:intelligent'](),
    'vsplit:plain': async () => {
      nvim.pauseNotification();
      nvim.command(`vsplit ${await getEscapePath()}`, true);
      jumpToNotify();
      (await explorer.tryQuitOnOpenNotifier()).notify();
      await nvim.resumeNotification();
    },

    'vsplit:intelligent': async () => {
      const position = await explorer.args.value(argOptions.position);
      if (position === 'floating') {
        await actions['vsplit:plain']();
        return;
      } else if (position === 'tab') {
        await actions['vsplit:plain']();
        return;
      }
      await splitIntelligent(position, 'vsplit', 'vsplit:plain');
    },

    tab: async () => {
      await explorer.tryQuitOnOpen();
      nvim.pauseNotification();
      nvim.command(`tabedit ${await getEscapePath()}`, true);
      jumpToNotify();
      await nvim.resumeNotification();
    },

    previousBuffer: async () => {
      const prevWinnr = await explorer.explorerManager.prevWinnrByPrevBufnr();
      if (prevWinnr) {
        await openByWinnr(prevWinnr);
      } else {
        await actions.vsplit();
      }
    },

    previousWindow: async () => {
      const prevWinnr = await explorer.explorerManager.prevWinnrByPrevWindowID();
      if (prevWinnr) {
        await openByWinnr(prevWinnr);
      } else {
        await actions.vsplit();
      }
    },

    sourceWindow: async () => {
      const srcWinnr = await explorer.sourceWinnr();
      if (srcWinnr) {
        await openByWinnr(srcWinnr);
      } else {
        await actions.vsplit();
      }
    },
  };

  let openStrategy = await explorer.args.value(argOptions.openActionStrategy);
  if (args.length) {
    openStrategy = args.join(':') as OpenStrategy;
  }
  if (!(openStrategy in actions)) {
    new Error(`openStrategy(${openStrategy}) is not supported`);
  }
  await actions[openStrategy]();
}

export function registerGlobalActions(explorer: Explorer) {
  const openActionArgs = [
    {
      name: 'open strategy',
      description: openStrategyList.join(' | '),
    },
    {
      name: 'open with position',
      description: 'line-number,column-number',
    },
  ];
  const openActionMenu = {
    select: 'use select window UI',
    'split:plain': 'use vim split',
    'split:intelligent': 'use split like vscode',
    'vsplit:plain': 'use vim vsplit',
    'vsplit:intelligent':
      'use vim vsplit, but keep the explorer in the original position',
    tab: 'vim tab',
    previousBuffer: 'use last used buffer',
    previousWindow: 'use last used window',
    sourceWindow: 'use the window where explorer opened',
  };
  explorer.addNodeAction(
    'open',
    async ({ node, args, mode }) => {
      if (node.expandable) {
        const directoryActionExp = explorer.config.get(
          'openAction.for.directory',
        );
        if (directoryActionExp) {
          await explorer.doActionExp(
            parseOriginalActionExp(directoryActionExp),
            { mode, lineIndexes: [explorer.flattenedNodes.indexOf(node)] },
          );
        }
        return;
      }

      if (node.location) {
        const { range } = node.location;
        await openAction(explorer, node, () => node.fullpath!, {
          args,
          position: { lineIndex: range.start.line - 1 },
        });
        return;
      }

      if (node.fullpath) {
        await openAction(explorer, node, () => node.fullpath!, {
          args,
        });
        return;
      }
    },
    'open file or directory',
    {
      multi: true,
      args: openActionArgs,
      menus: openActionMenu,
    },
  );

  const moveActionArgs = [
    {
      name: 'move action options',
      description: moveStrategyList.join(' | '),
    },
  ];
  const moveActionMenu = {
    insideSource: 'move inside current source',
  };
  explorer.addNodesAction(
    'nodePrev',
    async ({ args }) => {
      const moveStrategy = args[0] as MoveStrategy;
      if (moveStrategy === 'insideSource') {
        const source = await explorer.currentSource();
        if (!source) {
          return;
        }
        await source.gotoLineIndex(source.currentLineIndex - 1);
      } else {
        const line = explorer.currentLineIndex;
        await explorer.gotoLineIndex(line - 1);
      }
    },
    'previous node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  explorer.addNodesAction(
    'nodeNext',
    async ({ args }) => {
      const moveStrategy = args[0] as MoveStrategy;
      if (moveStrategy === 'insideSource') {
        const source = await explorer.currentSource();
        if (!source) {
          return;
        }
        await source.gotoLineIndex(source.currentLineIndex + 1);
      } else {
        const line = explorer.currentLineIndex;
        await explorer.gotoLineIndex(line + 1);
      }
    },
    'next node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  explorer.addNodesAction(
    'expandablePrev',
    async ({ args }) => {
      await explorer.nodePrev(
        args[0] as MoveStrategy,
        (node) => !!node.expandable,
      );
    },
    'previous expandable node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  explorer.addNodesAction(
    'expandableNext',
    async ({ args }) => {
      await explorer.nodeNext(
        args[0] as MoveStrategy,
        (node) => !!node.expandable,
      );
    },
    'next expandable node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  explorer.addNodesAction(
    'indentPrev',
    async ({ args }) => {
      const node = await explorer.currentNode();
      const level = node?.level ?? 0;
      await explorer.nodePrev(
        args[0] as MoveStrategy,
        (node) => node.level !== level,
      );
    },
    'previous indent node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  explorer.addNodesAction(
    'indentNext',
    async ({ args }) => {
      const node = await explorer.currentNode();
      const level = node?.level ?? 0;
      await explorer.nodeNext(
        args[0] as MoveStrategy,
        (node) => node.level !== level,
      );
    },
    'next indent node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  explorer.addNodesAction(
    'normal',
    async ({ args }) => {
      if (args[0]) {
        await explorer.nvim.command('execute "normal ' + args[0] + '"');
      }
    },
    'execute vim normal mode commands',
    {
      args: [
        {
          name: 'normal commands',
        },
      ],
      menus: {
        zz: 'execute normal zz',
      },
    },
  );
  explorer.addNodesAction(
    'quit',
    async () => {
      await explorer.quit();
    },
    'quit explorer',
  );

  explorer.addNodesAction(
    'preview',
    async ({ nodes, args }) => {
      const source = await explorer.currentSource();
      if (nodes && nodes[0] && source) {
        const node = nodes[0];
        const previewStrategy = args[0] as undefined | PreviewActionStrategy;
        if (!previewStrategy) {
          return;
        }
        const nodeIndex = source.getLineByNode(node);
        if (nodeIndex === undefined) {
          return;
        }

        await explorer.floatingPreview.previewNode(
          previewStrategy,
          source,
          node,
          nodeIndex,
        );
      }
    },
    'preview',
    {
      args: [
        {
          name: 'preview strategy',
          description: previewStrategyList.join(' | '),
        },
      ],
      menus: {
        labeling: 'preview for node labeling',
      },
    },
  );
  explorer.addNodesAction(
    'previewOnHover',
    async ({ args }) => {
      const previewOnHoverAction = args[0] as undefined | PreviewOnHoverAction;
      if (!previewOnHoverAction) {
        return;
      }

      const previewStrategy = args[1] as undefined | PreviewActionStrategy;
      if (!previewStrategy) {
        if (previewOnHoverAction === 'disable') {
          explorer.floatingPreview.unregisterOnHover();
        }
        return;
      }

      const delay = args[2] ? parseInt(args[2]) : 0;

      if (previewOnHoverAction === 'toggle') {
        explorer.floatingPreview.toggleOnHover(previewStrategy, delay);
      } else if (previewOnHoverAction === 'enable') {
        explorer.floatingPreview.registerOnHover(previewStrategy, delay);
      } else {
        explorer.floatingPreview.unregisterOnHover();
      }
    },
    'preview on hover',
    {
      args: [
        {
          name: 'sub action',
          description: previewOnHoverActionList.join(' | '),
        },
        {
          name: 'preview strategy',
          description: previewStrategyList.join(' | '),
        },
        {
          name: 'delay',
          description: 'delay millisecond',
        },
      ],
      menus: {
        'toggle:labeling': 'toggle labeling',
        'toggle:labeling:200': 'toggle labeling with debounce',
        'toggle:content': 'toggle content',
      },
    },
  );

  explorer.addNodesAction(
    'gotoSource',
    async ({ args }) => {
      const source = explorer.sources.find((s) => s.sourceType === args[0]);
      if (source) {
        await source.gotoLineIndex(0);
      }
    },
    'go to source',
  );
  explorer.addNodesAction(
    'sourceNext',
    async () => {
      const nextSource =
        explorer.sources[(await explorer.currentSourceIndex()) + 1];
      if (nextSource) {
        await nextSource.gotoLineIndex(0);
      } else if (await enableWrapscan()) {
        await explorer.sources[0].gotoLineIndex(0);
      }
    },
    'go to next source',
  );
  explorer.addNodesAction(
    'sourcePrev',
    async () => {
      const prevSource =
        explorer.sources[(await explorer.currentSourceIndex()) - 1];
      if (prevSource) {
        await prevSource.gotoLineIndex(0);
      } else if (await enableWrapscan()) {
        await explorer.sources[explorer.sources.length - 1].gotoLineIndex(0);
      }
    },
    'go to previous source',
  );

  explorer.addNodesAction(
    'modifiedPrev',
    async () => {
      await explorer.gotoPrevIndexing('modified');
    },
    'go to previous modified',
  );
  explorer.addNodesAction(
    'modifiedNext',
    async () => {
      await explorer.gotoNextIndexing('modified');
    },
    'go to next modified',
  );

  explorer.addNodesAction(
    'diagnosticPrev',
    async () => {
      await explorer.gotoPrevIndexing('diagnosticError', 'diagnosticWarning');
    },
    'go to previous diagnostic',
  );
  explorer.addNodesAction(
    'diagnosticNext',
    async () => {
      await explorer.gotoNextIndexing('diagnosticError', 'diagnosticWarning');
    },
    'go to next diagnostic',
  );

  explorer.addNodesAction(
    'gitPrev',
    async () => {
      await explorer.gotoPrevIndexing('git');
    },
    'go to previous git changed',
  );
  explorer.addNodesAction(
    'gitNext',
    async () => {
      await explorer.gotoNextIndexing('git');
    },
    'go to next git changed',
  );

  const indexOptions = {
    args: [
      {
        name: 'index name',
        description: 'string',
      },
    ],
    menus: {
      modified: 'modified',
      diagnosticWarning: 'diagnosticWarning',
      diagnosticError: 'diagnosticError',
      git: 'git',
    },
  };
  explorer.addNodesAction(
    'indexPrev',
    async ({ args }) => {
      await explorer.gotoPrevIndexing(...args);
    },
    'go to previous index',
    indexOptions,
  );
  explorer.addNodesAction(
    'indexNext',
    async ({ args }) => {
      await explorer.gotoNextIndexing(...args);
    },
    'go to next index',
    indexOptions,
  );
}
