import { workspace } from 'coc.nvim';
import { argOptions } from '../argOptions';
import type { Explorer } from '../explorer';
import { parseOriginalActionExp } from '../mappings';
import {
  collapseOptionList,
  expandOptionList,
  MoveStrategy,
  moveStrategyList,
  openStrategyList,
  PreviewOnHoverAction,
  previewOnHoverActionList,
  previewStrategyList,
} from '../types';
import { PreviewActionStrategy } from '../types/pkg-config';
import { enableWrapscan } from '../util';
import { openAction } from './openAction';

export function registerGlobalActions(explorer: Explorer) {
  const { nvim } = workspace;
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
  // open, expand, collapse
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
  explorer.addNodeAction(
    'expand',
    async ({ source, node, args }) => {
      if (node.expandable) {
        const options = (args[0] ?? '').split('|');
        const recursive = options.includes('recursive') || undefined;
        const compact = options.includes('compact') || undefined;
        const uncompact = options.includes('uncompact') || undefined;
        const recursiveSingle =
          options.includes('recursiveSingle') || undefined;
        await source.expand(node, {
          recursive,
          compact,
          uncompact,
          recursiveSingle,
        });
      }
    },
    'expand node',
    {
      multi: true,
      args: [
        {
          name: 'expand options',
          description: expandOptionList.join(' | '),
        },
      ],
      menus: {
        recursive: 'recursively',
        compact: 'single child folders will be compressed in a combined node',
        uncompact: 'reset the combined node',
        'compact|uncompact': 'compact or uncompact',
        recursiveSingle: 'expand single child folder recursively',
      },
    },
  );
  explorer.addNodeAction(
    'collapse',
    async ({ source, node, args }) => {
      const options = (args[0] ?? '').split('|');
      const all = options.includes('all');
      const recursive = options.includes('recursive');
      if (all && source.rootNode.children) {
        for (const subNode of source.rootNode.children) {
          if (subNode.expandable && source.isExpanded(subNode)) {
            await source.doAction(
              'collapse',
              subNode,
              options.filter((op) => op !== 'all'),
            );
          }
        }
      } else {
        if (node.expandable && source.isExpanded(node)) {
          await source.collapse(node, { recursive });
        } else if (node.parent) {
          await source.collapse(node.parent, { recursive });
        }
      }
    },
    'collapse node',
    {
      multi: true,
      args: [
        {
          name: 'collapse options',
          description: collapseOptionList.join(' | '),
        },
      ],
      menus: {
        recursive: 'recursively',
        all: 'for all nodes',
      },
    },
  );

  // move and jump
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

  // preview
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

  // select, hidden
  explorer.addNodeAction(
    'toggleHidden',
    async ({ source }) => {
      source.showHidden = !source.showHidden;
    },
    'toggle visibility of hidden node',
    { reload: true },
  );
  explorer.addNodeAction(
    'select',
    async ({ source, node }) => {
      source.selectedNodes.add(node);
      source.requestRenderNodes([node]);
    },
    'select node',
    { select: true },
  );
  explorer.addNodeAction(
    'unselect',
    async ({ source, node }) => {
      source.selectedNodes.delete(node);
      source.requestRenderNodes([node]);
    },
    'unselect node',
    { select: true },
  );
  explorer.addNodeAction(
    'toggleSelection',
    async ({ source, node }) => {
      if (source.selectedNodes.has(node)) {
        await source.doAction('unselect', node);
      } else {
        await source.doAction('select', node);
      }
    },
    'toggle node selection',
    { select: true },
  );

  // other
  explorer.addNodeAction(
    'refresh',
    async ({ source }) => {
      const loadNotifier = await source.loadNotifier(source.rootNode, {
        force: true,
      });

      nvim.pauseNotification();
      source.clearHighlightsNotify();
      loadNotifier?.notify();
      await nvim.resumeNotification();
    },
    'refresh',
  );
  explorer.addNodeAction(
    'help',
    async ({ source }) => {
      await source.explorer.showHelp(source);
    },
    'show help',
  );
  explorer.addNodesAction(
    'actionMenu',
    async ({ source, nodes }) => {
      await source.listActionMenu(nodes);
    },
    'show actions in coc-list',
  );
  explorer.addNodesAction(
    'normal',
    async ({ args }) => {
      if (args[0]) {
        await nvim.command('execute "normal ' + args[0] + '"');
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
  explorer.addNodeAction(
    'esc',
    async ({ source, mode }) => {
      const position = await source.explorer.args.value(argOptions.position);
      if (position === 'floating' && mode === 'n') {
        await source.explorer.quit();
      } else {
        source.requestRenderNodes(Array.from(source.selectedNodes));
        source.selectedNodes.clear();
      }
    },
    'esc action',
  );
  explorer.addNodesAction(
    'quit',
    async () => {
      await explorer.quit();
    },
    'quit explorer',
  );
}
