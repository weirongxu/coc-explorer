import { compactI } from 'coc-helper';
import { workspace } from 'coc.nvim';
import { argOptions } from '../arg/argOptions';
import { gitManager } from '../git/manager';
import { parseOriginalActionExp } from '../mappings';
import {
  collapseOptionList,
  expandOptionList,
  MoveStrategy,
  moveStrategyList,
  OpenPosition,
  OpenStrategy,
  openStrategyList,
  PreviewOnHoverAction,
  previewOnHoverActionList,
  previewStrategyList,
  TextobjTarget,
  textobjTargetList,
  textobjTypeList,
} from '../types';
import { PreviewActionStrategy } from '../types/pkg-config';
import { enableWrapscan, scanIndexNext, scanIndexPrev } from '../util';
import { ActionExplorer } from './actionExplorer';
import { openAction } from './openAction';

export function loadGlobalActions(action: ActionExplorer) {
  const explorer = action.owner;
  const locator = explorer.locator;
  const { nvim } = workspace;
  const openActionArgs = [
    {
      name: 'open strategy',
      description: openStrategyList.join(' | '),
    },
    {
      name: 'open with position',
      description: 'line-number,column-number | keep',
    },
  ];
  const openActionMenu = {
    select: 'use select window UI',
    'select:keep': 'use select window UI, but keep cursor in explorer',
    'split.plain': 'use vim split',
    'split.intelligent': 'use split like vscode',
    'vsplit.plain': 'use vim vsplit',
    'vsplit.intelligent':
      'use vim vsplit, but keep the explorer in the original position',
    tab: 'vim tab',
    previousBuffer: 'use last used buffer',
    previousWindow: 'use last used window',
    sourceWindow: 'use the window where explorer opened',
  };
  // open, expand, collapse
  action.addNodeAction(
    'open',
    async ({ source, node, args, mode }) => {
      if (node.expandable) {
        const directoryActionExp = explorer.config.get(
          'openAction.for.directory',
        );
        if (directoryActionExp) {
          await explorer.action.doActionExp(
            parseOriginalActionExp(directoryActionExp),
            { mode, lineIndexes: [explorer.view.flattenedNodes.indexOf(node)] },
          );
        }
        return;
      }

      const [openStrategy, positionRaw] = args as [
        OpenStrategy | undefined,
        string | undefined,
      ];

      let position: OpenPosition | undefined;
      if (positionRaw === 'keep') {
        position = positionRaw;
      } else if (positionRaw) {
        const [line, column] = positionRaw
          .split(',')
          .map((n) => parseInt(n, 10));
        position = {
          lineIndex: line,
        };
        if (column) {
          position.columnIndex = column;
        }
      } else if (node.location) {
        const { range } = node.location;
        position = { lineIndex: range.start.line - 1 };
      }

      await openAction(explorer, source, node, () => node.fullpath!, {
        openStrategy,
        position,
      });
    },
    'open file or directory',
    {
      select: true,
      args: openActionArgs,
      menus: openActionMenu as Record<string, string>,
    },
  );
  action.addNodeAction(
    'expand',
    async ({ source, node, args }) => {
      if (node.expandable) {
        const options = (args[0] ?? '').split('|');
        const recursive = options.includes('recursive') || undefined;
        const compact = options.includes('compact') || undefined;
        const uncompact = options.includes('uncompact') || undefined;
        const recursiveSingle =
          options.includes('recursiveSingle') || undefined;
        await source.view.expand(node, {
          recursive,
          compact,
          uncompact,
          recursiveSingle,
        });
      }
    },
    'expand node',
    {
      select: true,
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
  action.addNodeAction(
    'collapse',
    async ({ source, node, args }) => {
      const options = (args[0] ?? '').split('|');
      const all = options.includes('all');
      const recursive = options.includes('recursive');
      if (all && source.view.rootNode.children) {
        for (const subNode of source.view.rootNode.children) {
          if (subNode.expandable && source.view.isExpanded(subNode)) {
            await source.action.doAction(
              'collapse',
              subNode,
              options.filter((op) => op !== 'all'),
            );
          }
        }
      } else {
        if (node.expandable && source.view.isExpanded(node)) {
          await source.view.collapse(node, { recursive });
        } else if (node.parent) {
          await source.view.collapse(node.parent, { recursive });
        }
      }
    },
    'collapse node',
    {
      select: true,
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

  // git
  action.addNodesAction(
    'gitStage',
    async ({ nodes, source }) => {
      const fullpaths = compactI(nodes.map((node) => node.fullpath));
      if (!fullpaths.length) {
        return;
      }
      await gitManager.cmd.stage(fullpaths);
      const roots = await gitManager.getGitRoots(fullpaths);
      for (const root of roots) {
        await gitManager.reload(root);
      }
      source.view.requestRenderNodes([
        { nodes: nodes, withParents: true, withChildren: true },
      ]);
    },
    'add file to git index',
  );

  action.addNodesAction(
    'gitUnstage',
    async ({ nodes, source }) => {
      const fullpaths = compactI(nodes.map((node) => node.fullpath));
      if (!fullpaths.length) {
        return;
      }
      await gitManager.cmd.unstage(fullpaths);
      const roots = await gitManager.getGitRoots(fullpaths);
      for (const root of roots) {
        await gitManager.reload(root);
      }
      source.view.requestRenderNodes([
        { nodes: nodes, withParents: true, withChildren: true },
      ]);
    },
    'reset file from git index',
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
  action.addNodeAction(
    'nodePrev',
    async ({ args }) => {
      const moveStrategy = args[0] as MoveStrategy;
      if (moveStrategy === 'insideSource') {
        const source = await explorer.view.currentSource();
        if (!source) {
          return;
        }
        await source.locator.gotoLineIndex(source.view.currentLineIndex - 1);
      } else {
        const line = explorer.view.currentLineIndex;
        await locator.gotoLineIndex(line - 1);
      }
    },
    'previous node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  action.addNodeAction(
    'nodeNext',
    async ({ args }) => {
      const moveStrategy = args[0] as MoveStrategy;
      if (moveStrategy === 'insideSource') {
        const source = await explorer.view.currentSource();
        if (!source) {
          return;
        }
        await source.locator.gotoLineIndex(source.view.currentLineIndex + 1);
      } else {
        const line = explorer.view.currentLineIndex;
        await locator.gotoLineIndex(line + 1);
      }
    },
    'next node',
    {
      args: moveActionArgs,
      menus: moveActionMenu,
    },
  );
  action.addNodeAction(
    'expandablePrev',
    async ({ args }) => {
      await explorer.action.nodePrev(
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
  action.addNodeAction(
    'expandableNext',
    async ({ args }) => {
      await action.nodeNext(
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
  action.addNodeAction(
    'indentPrev',
    async ({ node, args }) => {
      const level = node.level ?? 0;
      await action.nodePrev(
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
  action.addNodeAction(
    'indentNext',
    async ({ node, args }) => {
      const level = node.level ?? 0;
      await action.nodeNext(
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

  action.addNodeAction(
    'gotoSource',
    async ({ args }) => {
      const source = explorer.sources.find((s) => s.sourceType === args[0]);
      if (source) {
        await source.locator.gotoLineIndex(0);
      }
    },
    'go to source',
  );
  action.addNodeAction(
    'sourceNext',
    async () => {
      const nextSource =
        explorer.sources[(await explorer.view.currentSourceIndex()) + 1];
      if (nextSource) {
        await nextSource.locator.gotoLineIndex(0);
      } else if (await enableWrapscan()) {
        await explorer.sources[0].locator.gotoLineIndex(0);
      }
    },
    'go to next source',
  );
  action.addNodeAction(
    'sourcePrev',
    async () => {
      const prevSource =
        explorer.sources[(await explorer.view.currentSourceIndex()) - 1];
      if (prevSource) {
        await prevSource.locator.gotoLineIndex(0);
      } else if (await enableWrapscan()) {
        await explorer.sources[
          explorer.sources.length - 1
        ].locator.gotoLineIndex(0);
      }
    },
    'go to previous source',
  );

  action.addNodeAction(
    'modifiedPrev',
    async () => {
      await locator.gotoPrevMark('modified');
    },
    'go to previous modified',
  );
  action.addNodeAction(
    'modifiedNext',
    async () => {
      await locator.gotoNextMark('modified');
    },
    'go to next modified',
  );

  action.addNodeAction(
    'diagnosticPrev',
    async () => {
      await locator.gotoPrevMark('diagnosticError', 'diagnosticWarning');
    },
    'go to previous diagnostic',
  );
  action.addNodeAction(
    'diagnosticNext',
    async () => {
      await locator.gotoNextMark('diagnosticError', 'diagnosticWarning');
    },
    'go to next diagnostic',
  );

  action.addNodeAction(
    'gitPrev',
    async () => {
      await locator.gotoPrevMark('git');
    },
    'go to previous git changed',
  );
  action.addNodeAction(
    'gitNext',
    async () => {
      await locator.gotoNextMark('git');
    },
    'go to next git changed',
  );

  const markOptions = {
    args: [
      {
        name: 'mark name',
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
  action.addNodeAction(
    'markPrev',
    async ({ args }) => {
      await locator.gotoPrevMark(...args);
    },
    'go to previous mark',
    markOptions,
  );
  action.addNodeAction(
    'markNext',
    async ({ args }) => {
      await locator.gotoNextMark(...args);
    },
    'go to next mark',
    markOptions,
  );

  // preview
  action.addNodeAction(
    'preview',
    async ({ source, node, args }) => {
      const previewStrategy = args[0] as undefined | PreviewActionStrategy;
      if (!previewStrategy) {
        return;
      }
      const nodeIndex = source.view.getLineByNode(node);
      if (nodeIndex === undefined) {
        return;
      }

      await explorer.floatingPreview.previewNode(
        previewStrategy,
        source,
        node,
        nodeIndex,
      );
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
  action.addNodeAction(
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
        'enable:content': 'enable with content',
        'enable:labeling': 'enable with labeling',
      },
    },
  );

  // textobj, select, hidden
  action.addNodeAction(
    'textobj',
    async ({ node: currentNode, args }) => {
      const currentIndex = explorer.view.currentLineIndex;
      const textobjTarget = (args[0] ?? 'line') as TextobjTarget;
      if (textobjTarget === 'line') {
        await nvim.command('normal! V');
      } else if (textobjTarget === 'indent') {
        const flattenedNodes = explorer.view.flattenedNodes;
        const begin = scanIndexPrev(
          flattenedNodes,
          currentIndex,
          await enableWrapscan(),
          (node) => {
            return (currentNode.level ?? 0) > (node.level ?? 0);
          },
        );
        if (begin === undefined) {
          return;
        }
        const end = scanIndexNext(
          flattenedNodes,
          currentIndex,
          await enableWrapscan(),
          (node) => {
            return (currentNode.level ?? 0) > (node.level ?? 0);
          },
        );
        if (end === undefined) {
          return;
        }
        await nvim.command(`normal! ${begin + 2}GV${end}G`);
      }
    },
    'use visual mode selects',
    {
      args: [
        {
          name: 'target',
          description: textobjTargetList.join(' | '),
        },
        {
          name: 'type',
          description: textobjTypeList.join(' | '),
        },
      ],
      menus: {
        'line:i': 'line:i',
        'line:a': 'line:a',
        'indent:i': 'indent:i',
        'indent:a': 'indent:a',
      },
    },
  );
  action.addNodeAction(
    'select',
    async ({ source, node }) => {
      source.selectedNodes.add(node);
      source.view.requestRenderNodes([node]);
    },
    'select node',
    { select: 'visual' },
  );
  action.addNodeAction(
    'unselect',
    async ({ source, node }) => {
      source.selectedNodes.delete(node);
      source.view.requestRenderNodes([node]);
    },
    'unselect node',
    { select: 'visual' },
  );
  action.addNodeAction(
    'toggleSelection',
    async ({ source, node }) => {
      if (source.selectedNodes.has(node)) {
        await source.action.doAction('unselect', node);
      } else {
        await source.action.doAction('select', node);
      }
    },
    'toggle node selection',
    {
      select: 'visual',
    },
  );
  action.addNodeAction(
    'toggleHidden',
    async ({ source }) => {
      source.showHidden = !source.showHidden;
    },
    'toggle visibility of hidden node',
    {
      reload: true,
    },
  );

  // other
  action.addNodeAction(
    'refresh',
    async ({ source }) => {
      source.selectedNodes.clear();

      const loadNotifier = await source.loadNotifier(source.view.rootNode, {
        force: true,
      });

      nvim.pauseNotification();
      source.highlight.clearHighlightsNotify();
      loadNotifier?.notify();
      await nvim.resumeNotification();
    },
    'refresh',
  );
  action.addNodeAction(
    'help',
    async ({ source }) => {
      await source.explorer.showHelp(source);
    },
    'show help',
  );
  action.addNodeAction(
    'actionMenu',
    async ({ source, node }) => {
      await source.action.listActionMenu([node]);
    },
    'show actions in coc-list',
  );
  action.addNodeAction(
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
  action.addNodeAction(
    'esc',
    async ({ source, mode }) => {
      const position = await source.explorer.args.value(argOptions.position);
      if (position === 'floating' && mode === 'n') {
        await source.explorer.quit();
      } else {
        source.view.requestRenderNodes(Array.from(source.selectedNodes));
        source.selectedNodes.clear();
      }
    },
    'esc action',
  );
  action.addNodeAction(
    'quit',
    async () => {
      await explorer.quit();
    },
    'quit explorer',
  );
}
