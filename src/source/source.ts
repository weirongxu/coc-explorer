import {
  Disposable,
  ExtensionContext,
  IList,
  listManager,
  Uri,
  workspace,
  Emitter,
} from 'coc.nvim';
import { Explorer } from '../explorer';
import { explorerActionList } from '../lists/actions';
import { onError } from '../logger';
import { getMappings, getReverseMappings } from '../mappings';
import { argOptions } from '../parse-args';
import {
  config,
  generateUri,
  getEnableNerdfont,
  getPreviewStrategy,
  Notifier,
  onEvents,
  PreviewStrategy,
} from '../util';
import {
  HighlightPosition,
  HighlightPositionWithLine,
} from './highlight-manager';
import { DrawLabelingResult, TemplateRenderer } from './template-renderer';
import { SourceViewBuilder } from './view-builder';
import { WinLayoutFinder } from '../win-layout-finder';
import { OpenStrategy } from '../types';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
  select: boolean;
};

export type RenderOptions<TreeNode extends BaseTreeNode<any>> = {
  node?: TreeNode;
  force?: boolean;
};

export const sourceIcons = {
  getExpanded: () =>
    config.get<string>('icon.expanded') || (getEnableNerdfont() ? '' : '-'),
  getCollapsed: () =>
    config.get<string>('icon.collapsed') || (getEnableNerdfont() ? '' : '+'),
  getSelected: () => config.get<string>('icon.selected')!,
  getHidden: () => config.get<string>('icon.hidden')!,
};

export interface BaseTreeNode<
  TreeNode extends BaseTreeNode<TreeNode>,
  Type extends string = string
> {
  type: Type;
  isRoot?: boolean;
  uri: string;
  level: number;
  drawnLine: string;
  highlightPositions?: HighlightPosition[];
  expandable?: boolean;
  parent?: TreeNode;
  children?: TreeNode[];
  prevSiblingNode?: TreeNode;
  nextSiblingNode?: TreeNode;
}

export type ExplorerSourceClass = {
  new (name: string, explorer: Explorer): ExplorerSource<any>;
};

export abstract class ExplorerSource<TreeNode extends BaseTreeNode<TreeNode>> {
  abstract scheme: string;
  abstract hlSrcId: number;
  startLineIndex: number = 0;
  endLineIndex: number = 0;
  abstract rootNode: TreeNode;
  width: number = 0;
  flattenedNodes: TreeNode[] = [];
  showHidden: boolean = false;
  selectedNodes: Set<TreeNode> = new Set();
  readonly viewBuilder = new SourceViewBuilder(this.explorer);
  readonly expandStore = {
    record: new Map<string, boolean>(),
    expand(node: TreeNode) {
      this.record.set(node.uri, true);
    },
    collapse(node: TreeNode) {
      this.record.set(node.uri, false);
    },
    isExpanded(node: TreeNode) {
      return this.record.get(node.uri) || false;
    },
  };
  readonly helper = {
    generateUri: (path: string) => generateUri(path, this.scheme),
  };
  bufManager = this.explorer.explorerManager.bufManager;
  templateRenderer?: TemplateRenderer<TreeNode>;

  actions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (nodes: TreeNode[], args: string[]) => void | Promise<void>;
    }
  > = {};
  hlIds: number[] = []; // hightlight match ids for vim8.0
  nvim = workspace.nvim;
  context: ExtensionContext;

  private requestedRenderNodes: Set<TreeNode> = new Set();
  subscriptions: Disposable[];

  constructor(public sourceType: string, public explorer: Explorer) {
    this.context = this.explorer.context;
    this.subscriptions = this.context.subscriptions;

    this.addNodeAction(
      'esc',
      async () => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating') {
          await this.explorer.quit();
        } else {
          this.requestRenderNodes(Array.from(this.selectedNodes));
          this.selectedNodes.clear();
        }
      },
      'esc action',
    );
    this.addNodeAction(
      'toggleHidden',
      async () => {
        this.showHidden = !this.showHidden;
      },
      'toggle visibility of hidden node',
      { reload: true },
    );
    this.addNodeAction(
      'refresh',
      async () => {
        const reloadNotifier = await this.reloadNotifier(this.rootNode, {
          force: true,
        });

        const highlights: HighlightPositionWithLine[] = [];
        for (let i = 0; i < this.flattenedNodes.length; i++) {
          const node = this.flattenedNodes[i];
          if (node.highlightPositions) {
            for (const highlightPosition of node.highlightPositions) {
              highlights.push({
                ...highlightPosition,
                line: this.startLineIndex + i,
              });
            }
          }
        }

        this.nvim.pauseNotification();
        reloadNotifier?.notify();
        this.clearHighlightsNotify();
        this.executeHighlightsNotify(highlights);
        await this.nvim.resumeNotification();
      },
      'refresh',
    );
    this.addNodeAction(
      'help',
      async () => {
        await this.explorer.showHelp(this);
      },
      'show help',
    );
    this.addNodesAction(
      'actionMenu',
      async (nodes) => {
        await this.listActionMenu(nodes);
      },
      'show actions in coc-list',
    );
    this.addNodeAction(
      'select',
      async (node) => {
        this.selectedNodes.add(node);
        this.requestRenderNodes([node]);
      },
      'select node',
      { select: true },
    );
    this.addNodeAction(
      'unselect',
      async (node) => {
        this.selectedNodes.delete(node);
        this.requestRenderNodes([node]);
      },
      'unselect node',
      { select: true },
    );
    this.addNodeAction(
      'toggleSelection',
      async (node) => {
        if (this.selectedNodes.has(node)) {
          await this.doAction('unselect', node);
        } else {
          await this.doAction('select', node);
        }
      },
      'toggle node selection',
      { select: true },
    );
  }

  get expanded() {
    return this.expandStore.isExpanded(this.rootNode);
  }

  set expanded(expanded: boolean) {
    if (expanded) {
      this.expandStore.expand(this.rootNode);
    } else {
      this.expandStore.collapse(this.rootNode);
    }
  }

  get height() {
    return this.flattenedNodes.length;
  }

  boot(expanded: boolean) {
    Promise.resolve(this.init()).catch(onError);
    this.expanded = expanded;
  }

  abstract init(): Promise<void>;

  abstract open(): Promise<void>;

  async openedNotifier(_isFirst: boolean): Promise<Notifier | void> {
    return Notifier.create(() => {});
  }

  addNodesAction(
    name: string,
    callback: (nodes: TreeNode[], args: string[]) => void | Promise<void>,
    description: string,
    options: Partial<Omit<ActionOptions, 'multi'>> = {},
  ) {
    this.actions[name] = {
      callback,
      description,
      options: {
        ...options,
        multi: true,
      },
    };
  }

  addNodeAction(
    name: string,
    callback: (node: TreeNode, args: string[]) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback: async (nodes: TreeNode[], args) => {
        for (const node of nodes) {
          await callback(node, args);
        }
      },
      description,
      options,
    };
  }

  async doAction(
    name: string,
    nodes: TreeNode | TreeNode[],
    args: string[] = [],
  ) {
    const action = this.actions[name] || this.explorer.globalActions[name];
    if (!action) {
      return;
    }

    const {
      multi = false,
      render = false,
      reload = false,
      select = false,
    } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    if (select) {
      await action.callback(finalNodes, args);
    } else if (multi) {
      if (this.selectedNodes.size > 0) {
        const nodes = Array.from(this.selectedNodes);
        this.selectedNodes.clear();
        this.requestRenderNodes(nodes);
        await action.callback(nodes, args);
      } else {
        await action.callback(finalNodes, args);
      }
    } else {
      await action.callback([finalNodes[0]], args);
    }

    if (reload) {
      await this.reload(this.rootNode);
    } else if (render) {
      await this.render();
    }
  }

  async openAction(
    node: TreeNode,
    {
      openByWinnr: originalOpenByWinnr,
      getURI = async () => {
        const uri = Uri.parse(node.uri);
        if (uri.scheme === 'file') {
          return (await this.nvim.call('fnameescape', uri.fsPath)) as string;
        } else {
          return (await this.nvim.call('fnameescape', node.uri)) as string;
        }
      },
      openStrategy,
    }: {
      openByWinnr?: (winnr: number) => void | Promise<void>;
      getURI?: () => string | Promise<string>;
      openStrategy?: OpenStrategy;
    },
  ) {
    if (node.expandable) {
      return;
    }
    const { nvim } = this;
    const openByWinnr =
      originalOpenByWinnr ??
      (async (winnr: number) => {
        nvim.pauseNotification();
        nvim.command(`${winnr}wincmd w`, true);
        nvim.command(`edit ${await getURI()}`, true);
        if (workspace.isVim) {
          // Avoid vim highlight not working,
          // https://github.com/weirongxu/coc-explorer/issues/113
          nvim.command('redraw', true);
        }
        await nvim.resumeNotification();
      });
    const actions: Record<
      OpenStrategy,
      (args?: string[]) => void | Promise<void>
    > = {
      select: async () => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating') {
          await this.explorer.quit();
        }
        await this.explorer.selectWindowsUI(
          async (winnr) => {
            await openByWinnr(winnr);
            await this.explorer.tryQuitOnOpen();
          },
          async () => {
            await actions.vsplit();
          },
          async () => {
            if (position === 'floating') {
              await this.explorer.resume(this.explorer.args);
            }
          },
        );
      },
      split: async (args) => {
        type Mode = 'intelligent' | 'plain';
        const mode: Mode = (args?.[0] ?? 'intelligent') as Mode;
        if (mode === 'plain') {
          await nvim.command(`split ${await getURI()}`);
          await this.explorer.tryQuitOnOpen();
        } else {
          const position = await this.explorer.args.value(argOptions.position);
          if (position === 'floating') {
            await actions.split(['plain']);
            return;
          } else if (position === 'tab') {
            await actions.vsplit();
            return;
          }

          const explWinid = await this.explorer.winid;
          if (!explWinid) {
            return;
          }

          const winFinder = await WinLayoutFinder.create();
          const node = winFinder.findWinid(explWinid);
          if (node) {
            if (node.parent) {
              const target =
                node.parent.group.children[
                  node.parent.indexInParent + (position === 'left' ? 1 : -1)
                ];
              if (target) {
                const targetWinid = WinLayoutFinder.getFirstLeafWinid(target);

                nvim.pauseNotification();
                nvim.call('win_gotoid', [targetWinid], true);
                nvim.command(`split ${await getURI()}`, true);
                await nvim.resumeNotification();
                await this.explorer.tryQuitOnOpen();
              }
            } else {
              actions.vsplit();
            }
          } else {
            actions.split(['plain']);
          }
        }
      },
      vsplit: async () => {
        nvim.pauseNotification();
        nvim.command(`vsplit ${await getURI()}`, true);
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'left') {
          nvim.command('wincmd L', true);
        } else if (position === 'right') {
          nvim.command('wincmd H', true);
        } else if (position === 'tab') {
          nvim.command('wincmd L', true);
        }
        await nvim.resumeNotification();
        await this.explorer.tryQuitOnOpen();
      },
      tab: async () => {
        await this.explorer.tryQuitOnOpen();
        await nvim.command(`tabedit ${await getURI()}`);
      },
      previousBuffer: async () => {
        const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevBufnr();
        if (prevWinnr) {
          await openByWinnr(prevWinnr);
        } else {
          await actions.vsplit();
        }
        await this.explorer.tryQuitOnOpen();
      },
      previousWindow: async () => {
        const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevWindowID();
        if (prevWinnr) {
          await openByWinnr(prevWinnr);
        } else {
          await actions.vsplit();
        }
        await this.explorer.tryQuitOnOpen();
      },
      sourceWindow: async () => {
        const srcWinnr = await this.explorer.sourceWinnr();
        if (srcWinnr) {
          await openByWinnr(srcWinnr);
        } else {
          await actions.vsplit();
        }
        await this.explorer.tryQuitOnOpen();
      },
    };
    const openStrategyOption = await this.explorer.args.value(
      argOptions.openActionStrategy,
    );
    await actions[openStrategy ?? openStrategyOption]();
  }

  async previewAction(node: TreeNode, previewStrategy?: PreviewStrategy) {
    const nodeIndex = this.getLineByNode(node);
    await this.explorer.floatingWindow.previewNode(
      previewStrategy || getPreviewStrategy(),
      this,
      node,
      nodeIndex,
    );
  }

  addIndexes(name: string, relativeIndex: number) {
    this.explorer.addIndexes(name, relativeIndex + this.startLineIndex);
  }

  removeIndexes(name: string, relativeIndex: number) {
    this.explorer.removeIndexes(name, relativeIndex + this.startLineIndex);
  }

  async copy(content: string) {
    await this.nvim.call('setreg', ['+', content]);
    await this.nvim.call('setreg', ['"', content]);
  }

  async startCocList(list: IList) {
    const isFloating =
      (await this.explorer.args.value(argOptions.position)) === 'floating';
    if (isFloating) {
      await this.explorer.hide();
    }

    let isShown = isFloating ? false : true;
    const shownExplorerEmitter = new Emitter<void>();
    const disposable = listManager.registerList(list);
    await listManager.start([list.name]);
    disposable.dispose();

    listManager.ui.onDidClose(async () => {
      await new Promise((resolve) => {
        const disposable = onEvents('BufEnter', () => {
          if (listManager.ui.window?.id === undefined) {
            disposable.dispose();
            resolve();
          }
        });
      });
      if (isFloating && !isShown) {
        await this.explorer.show();
        shownExplorerEmitter.fire();
      }
    });
    return {
      waitShow() {
        if (isShown) {
          return;
        }
        return new Promise((resolve) => {
          shownExplorerEmitter.event(() => {
            isShown = true;
            resolve();
          });
        });
      },
    };
  }

  async listActionMenu(nodes: TreeNode[]) {
    const actions = {
      ...this.explorer.globalActions,
      ...this.actions,
    };

    const mappings = await getMappings();
    const reverseMappings = await getReverseMappings();

    explorerActionList.setExplorerActions(
      Object.entries(actions)
        .sort(([aName], [bName]) => aName.localeCompare(bName))
        .map(([actionName, { callback, description }]) => ({
          name: actionName,
          nodes,
          mappings,
          root: nodes === null,
          key: reverseMappings[actionName],
          description,
          async callback() {
            await task.waitShow();
            callback(nodes, []);
          },
        }))
        .filter((a) => a.name !== 'actionMenu'),
    );
    const task = await this.startCocList(explorerActionList);
    await task.waitShow();
  }

  isSelectedAny() {
    return this.selectedNodes.size !== 0;
  }

  isSelectedNode(node: TreeNode) {
    return this.selectedNodes.has(node);
  }

  getNodeByLine(lineIndex: number): TreeNode | undefined {
    return this.flattenedNodes[lineIndex];
  }

  /**
   * Get relative line index for source by node
   */
  getLineByNode(node: TreeNode): number {
    if (node) {
      return this.flattenedNodes.findIndex((it) => it.uri === node.uri);
    } else {
      return 0;
    }
  }

  /**
   * Relative line index for source
   */
  get currentLineIndex() {
    return this.explorer.lineIndex - this.startLineIndex;
  }

  async currentNode() {
    return this.flattenedNodes[this.currentLineIndex] as TreeNode | undefined;
  }

  async gotoLineIndex(lineIndex: number, col?: number) {
    return (
      await this.explorer.gotoLineIndexNotifier(
        this.startLineIndex + lineIndex,
        col,
      )
    ).run();
  }

  gotoLineIndexNotifier(lineIndex: number, col?: number) {
    if (lineIndex < 0) {
      lineIndex = 0;
    }
    if (lineIndex > this.height) {
      lineIndex = this.height - 1;
    }
    return this.explorer.gotoLineIndexNotifier(
      this.startLineIndex + lineIndex,
      col,
    );
  }

  async gotoRoot({ col }: { col?: number } = {}) {
    return (await this.gotoLineIndexNotifier(0, col)).run();
  }

  gotoRootNotifier({ col }: { col?: number } = {}) {
    return this.gotoLineIndexNotifier(0, col);
  }

  /**
   * if node is null, move to root, otherwise move to node
   */
  async gotoNode(
    node: TreeNode,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return (await this.gotoNodeNotifier(node, options)).run();
  }

  /**
   * if node is null, move to root, otherwise move to node
   */
  async gotoNodeNotifier(
    node: TreeNode,
    {
      lineIndex: fallbackLineIndex,
      col = 0,
    }: { lineIndex?: number; col?: number } = {},
  ) {
    const lineIndex = this.flattenedNodes.findIndex(
      (it) => it.uri === node.uri,
    );
    if (lineIndex !== -1) {
      return this.gotoLineIndexNotifier(lineIndex, col);
    } else if (fallbackLineIndex !== undefined) {
      return this.gotoLineIndexNotifier(fallbackLineIndex, col);
    } else {
      return this.gotoRootNotifier({ col: col });
    }
  }

  abstract loadChildren(
    parentNode: TreeNode,
    options?: { force: boolean },
  ): Promise<TreeNode[]>;

  async loaded(parentNode: TreeNode): Promise<void> {
    await this.templateRenderer?.reload(parentNode);
  }

  /**
   * @returns return true to redraw all rows
   */
  async beforeDraw(nodes: TreeNode[], { force = false } = {}) {
    const renderAll = await this.templateRenderer?.beforeDraw(nodes);
    return !!renderAll;
  }

  drawRootLabeling(
    _node: TreeNode,
  ): undefined | DrawLabelingResult | Promise<DrawLabelingResult> {
    return;
  }

  abstract drawNode(node: TreeNode, nodeIndex: number): void | Promise<void>;

  flattenByNode(node: TreeNode) {
    return [node, ...(node.children ? this.flattenByNodes(node.children) : [])];
  }

  flattenByNodes(nodes: TreeNode[]) {
    const stack = [...nodes];
    const res = [];
    while (stack.length) {
      const node = stack.shift()!;
      res.push(node);
      if (
        node.children &&
        Array.isArray(node.children) &&
        this.expandStore.isExpanded(node)
      ) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.unshift(node.children[i]);
        }
      }
    }
    return res;
  }

  async drawNodes(nodes: TreeNode[]) {
    const highlightPositions: HighlightPositionWithLine[] = [];

    await Promise.all(
      nodes.map(async (node) => {
        if (node.isRoot) {
          await this.drawNode(node, 0);
          if (node.highlightPositions) {
            highlightPositions.push(
              ...node.highlightPositions.map((hl) => ({
                line: this.startLineIndex,
                ...hl,
              })),
            );
          }
          return;
        }

        const nodeIndex = this.flattenedNodes.findIndex(
          (it) => it.uri === node.uri,
        );
        if (nodeIndex > -1) {
          if (node.parent?.children) {
            const siblingIndex = node.parent.children.indexOf(node);
            if (siblingIndex !== -1) {
              node.prevSiblingNode = node.parent.children[siblingIndex - 1];
              node.nextSiblingNode = node.parent.children[siblingIndex + 1];
            }
          }
          await this.drawNode(node, nodeIndex);
          if (node.highlightPositions) {
            highlightPositions.push(
              ...node.highlightPositions.map((hl) => ({
                line: this.startLineIndex + nodeIndex,
                ...hl,
              })),
            );
          }
        }
      }),
    );

    return highlightPositions;
  }

  clearHighlightsNotify(lineStart?: number, lineEnd?: number) {
    this.explorer.clearHighlightsNotify(this.hlSrcId, lineStart, lineEnd);
  }

  executeHighlightsNotify(highlights: HighlightPositionWithLine[]) {
    this.explorer.executeHighlightsNotify(this.hlSrcId, highlights);
  }

  currentSourceIndex() {
    return this.explorer.sources.indexOf(this as ExplorerSource<any>);
  }

  async reload(
    parentNode: TreeNode,
    options?: { render?: boolean; force?: boolean },
  ) {
    return (await this.reloadNotifier(parentNode, options))?.run();
  }

  async reloadNotifier(
    parentNode: TreeNode,
    { render = true, force = false } = {},
  ) {
    await this.explorer.refreshWidth();
    this.selectedNodes = new Set();
    parentNode.children = this.expandStore.isExpanded(parentNode)
      ? await this.loadChildren(parentNode, { force })
      : [];
    await this.loaded(parentNode);
    if (render) {
      return this.renderNotifier({ node: parentNode, force });
    }
  }

  private offsetAfterLine(offset: number, afterLine: number) {
    this.explorer.indexesManager.offsetLines(
      offset,
      this.startLineIndex + afterLine + 1,
    );
    this.endLineIndex += offset;
    this.explorer.sources
      .slice(this.currentSourceIndex() + 1)
      .forEach((source) => {
        source.startLineIndex += offset;
        source.offsetAfterLine(offset, source.startLineIndex);
      });
  }

  setLinesNotifier(lines: string[], startIndex: number, endIndex: number) {
    return this.explorer.setLinesNotifier(
      lines,
      this.startLineIndex + startIndex,
      this.startLineIndex + endIndex,
    );
  }

  private nodeAndChildrenRange(
    node: TreeNode,
  ): { startIndex: number; endIndex: number } | null {
    const startIndex = this.flattenedNodes.findIndex(
      (it) => it.uri === node.uri,
    );
    if (startIndex === -1) {
      return null;
    }
    const parentLevel = node.level;
    let endIndex = this.flattenedNodes.length - 1;
    for (
      let i = startIndex + 1, len = this.flattenedNodes.length;
      i < len;
      i++
    ) {
      if (this.flattenedNodes[i].level <= parentLevel) {
        endIndex = i - 1;
        break;
      }
    }
    return { startIndex, endIndex };
  }

  private async expandNodeRender(node: TreeNode) {
    if (!this.expandStore.isExpanded(node) || !node.children) {
      return;
    }
    const range = this.nodeAndChildrenRange(node);
    if (!range) {
      return;
    }
    const { startIndex, endIndex } = range;
    const needDrawNodes = this.flattenByNode(node);
    if (await this.beforeDraw(needDrawNodes)) {
      await this.render();
      return;
    }
    this.flattenedNodes = this.flattenedNodes
      .slice(0, startIndex)
      .concat(needDrawNodes)
      .concat(this.flattenedNodes.slice(endIndex + 1));
    this.offsetAfterLine(needDrawNodes.length - 1, startIndex);
    const highlights = await this.drawNodes(needDrawNodes);
    const gotoNotifier = await this.gotoLineIndexNotifier(startIndex, 0);

    this.nvim.pauseNotification();
    this.setLinesNotifier(
      needDrawNodes.map((node) => node.drawnLine),
      startIndex,
      endIndex + 1,
    ).notify();
    this.executeHighlightsNotify(highlights);
    gotoNotifier.notify();
    await this.nvim.resumeNotification();
  }

  private async expandNodeRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.expandStore.expand(node);
      node.children = await this.loadChildren(node);
      if (
        recursive ||
        (node.children.length === 1 &&
          node.children[0].expandable &&
          config.get<boolean>('autoExpandSingleNode')!)
      ) {
        await Promise.all(
          node.children.map(async (child) => {
            await this.expandNodeRecursive(child, recursive);
          }),
        );
      }
    }
  }

  async expandNode(node: TreeNode, { recursive = false } = {}) {
    await this.expandNodeRecursive(node, recursive);
    await this.expandNodeRender(node);
  }

  private async collapseNodeRender(node: TreeNode) {
    if (this.expandStore.isExpanded(node)) {
      return;
    }
    const range = this.nodeAndChildrenRange(node);
    if (!range) {
      return;
    }
    if (await this.beforeDraw([node])) {
      await this.render();
      return;
    }
    const { startIndex, endIndex } = range;
    this.flattenedNodes.splice(startIndex + 1, endIndex - startIndex);
    this.explorer.indexesManager.removeLines(
      this.startLineIndex + startIndex + 1,
      this.startLineIndex + endIndex,
    );
    this.offsetAfterLine(-(endIndex - startIndex), endIndex);
    const highlights = await this.drawNodes([node]);
    const gotoNotifier = await this.gotoLineIndexNotifier(startIndex, 0);

    this.nvim.pauseNotification();
    this.setLinesNotifier([node.drawnLine], startIndex, endIndex + 1).notify();
    this.executeHighlightsNotify(highlights);
    gotoNotifier.notify();
    await this.nvim.resumeNotification();
  }

  private async collapseNodeRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.expandStore.collapse(node);
      if (recursive || config.get<boolean>('autoCollapseChildren')!) {
        if (node.children) {
          for (const child of node.children) {
            await this.collapseNodeRecursive(child, recursive);
          }
        }
      }
    }
  }

  async collapseNode(node: TreeNode, { recursive = false } = {}) {
    await this.collapseNodeRecursive(node, recursive);
    await this.collapseNodeRender(node);
  }

  requestRenderNodes(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      this.requestedRenderNodes.add(node);
    });
  }

  async emitRequestRenderNodesNotifier() {
    if (this.requestedRenderNodes.size <= 0) {
      return;
    }
    const nodes = Array.from(this.requestedRenderNodes);
    this.requestedRenderNodes.clear();
    return this.renderNodesNotifier(nodes);
  }

  async renderNodesNotifier(nodes: TreeNode[]) {
    if (await this.beforeDraw(nodes)) {
      return this.renderNotifier();
    }
    const highlights: HighlightPositionWithLine[] = [];
    const needDrawNodes: [TreeNode, number][] = [];
    await Promise.all(
      nodes.map(async (node) => {
        const nodeIndex = this.flattenedNodes.findIndex(
          (it) => it.uri === node.uri,
        );
        if (nodeIndex === -1) {
          return;
        }
        highlights.push(...(await this.drawNodes([node])));
        needDrawNodes.push([node, nodeIndex]);
      }),
    );
    return Notifier.create(() => {
      needDrawNodes.forEach(([node, nodeIndex]) =>
        this.setLinesNotifier(
          [node.drawnLine],
          nodeIndex,
          nodeIndex + 1,
        ).notify(),
      );
      this.executeHighlightsNotify(highlights);
    });
  }

  async render(options?: RenderOptions<TreeNode>) {
    return (await this.renderNotifier(options))?.run();
  }

  async renderNotifier({
    node = this.rootNode,
    force = false,
  }: RenderOptions<TreeNode> = {}) {
    if (this.explorer.isHelpUI) {
      return;
    }

    const { nvim } = this;

    const range = this.nodeAndChildrenRange(node);
    if (!range && !node.isRoot) {
      return;
    }

    const { startIndex: nodeIndex, endIndex } = range
      ? range
      : { startIndex: 0, endIndex: this.flattenedNodes.length - 1 };
    const oldHeight = endIndex - nodeIndex + 1;
    const needDrawNodes = this.flattenByNode(node);
    const newHeight = needDrawNodes.length;
    this.flattenedNodes = this.flattenedNodes
      .slice(0, nodeIndex)
      .concat(needDrawNodes)
      .concat(this.flattenedNodes.slice(endIndex + 1));

    if (newHeight < oldHeight) {
      this.explorer.indexesManager.removeLines(
        this.startLineIndex + newHeight + 1,
        this.startLineIndex + oldHeight + 1,
      );
    }
    this.offsetAfterLine(newHeight - oldHeight, this.endLineIndex);
    await this.beforeDraw(needDrawNodes, { force });
    const highlights = await this.drawNodes(needDrawNodes);

    const sourceIndex = this.currentSourceIndex();
    const isLastSource = this.explorer.sources.length - 1 == sourceIndex;

    return Notifier.create(() => {
      this.explorer
        .setLinesNotifier(
          needDrawNodes.map((node) => node.drawnLine),
          this.startLineIndex + nodeIndex,
          isLastSource && node.isRoot
            ? -1
            : this.startLineIndex + nodeIndex + oldHeight,
        )
        .notify();
      this.executeHighlightsNotify(highlights);

      if (workspace.env.isVim) {
        nvim.command('redraw', true);
      }
    });
  }
}
