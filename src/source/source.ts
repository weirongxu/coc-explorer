import { listManager, workspace, ExtensionContext, Disposable } from 'coc.nvim';
import { Range } from 'vscode-languageserver-protocol';
import { explorerActionList } from '../lists/actions';
import { Explorer } from '../explorer';
import { onError } from '../logger';
import { ActionSyms, mappings, reverseMappings, ActionMode } from '../mappings';
import { config, execNotifyBlock, openStrategy } from '../util';
import { SourceViewBuilder, HighlightPosition } from './view-builder';
import { hlGroupManager } from './highlight-manager';
import { ColumnManager, DrawMultiLineResult } from './column-manager';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
  select: boolean;
};

export const enableNerdfont = config.get<string>('icon.enableNerdfont')!;

export const sourceIcons = {
  expanded: config.get<string>('icon.expanded') || (enableNerdfont ? '' : '-'),
  collapsed: config.get<string>('icon.collapsed') || (enableNerdfont ? '' : '+'),
  selected: config.get<string>('icon.selected')!,
  unselected: config.get<string>('icon.unselected')!,
  hidden: config.get<string>('icon.hidden')!,
};

export interface BaseTreeNode<TreeNode extends BaseTreeNode<TreeNode>> {
  isRoot?: boolean;
  uid: string;
  level: number;
  drawnLine: string;
  expandable?: boolean;
  parent?: BaseTreeNode<TreeNode>;
  children?: TreeNode[];
}

export interface DrawNodeOption<TreeNode extends BaseTreeNode<TreeNode>> {
  prevSiblingNode?: TreeNode;
  nextSiblingNode?: TreeNode;
}

export type ExplorerSourceClass = {
  new (name: string, explorer: Explorer): ExplorerSource<any>;
};

export abstract class ExplorerSource<TreeNode extends BaseTreeNode<TreeNode>> {
  startLine: number = 0;
  endLine: number = 0;
  abstract rootNode: TreeNode;
  flattenedNodes: TreeNode[] = [];
  showHidden: boolean = false;
  selectedNodes: Set<TreeNode> = new Set();
  relativeHlRanges: Record<string, Range[]> = {};
  viewBuilder = new SourceViewBuilder();
  expandStore = {
    record: new Map<string, boolean>(),
    expand(node: TreeNode) {
      this.record.set(node.uid, true);
    },
    collapse(node: TreeNode) {
      this.record.set(node.uid, false);
    },
    isExpanded(node: TreeNode) {
      return this.record.get(node.uid) || false;
    },
  };
  columnManager = new ColumnManager<TreeNode>(this);

  actions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (
        nodes: TreeNode[],
        arg: string | undefined,
        mode: ActionMode,
      ) => void | Promise<void>;
    }
  > = {};
  rootActions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (arg: string | undefined, mode: ActionMode) => void | Promise<void>;
    }
  > = {};
  hlIds: number[] = []; // hightlight match ids for vim8.0
  nvim = workspace.nvim;
  context: ExtensionContext;

  private requestedRenderNodes: Set<TreeNode> = new Set();
  subscriptions: Disposable[];

  constructor(public sourceName: string, public explorer: Explorer) {
    this.context = this.explorer.context;
    this.subscriptions = this.context.subscriptions;

    this.addAction(
      'toggleHidden',
      async () => {
        this.showHidden = !this.showHidden;
      },
      'toggle visibility of hidden node',
      { reload: true, multi: false },
    );
    this.addAction(
      'refresh',
      async () => {
        await this.reload(this.rootNode, { force: true });
        await this.explorer.executeHighlightSyntax();
      },
      'refresh',
      { multi: false },
    );
    this.addAction(
      'help',
      async (nodes) => {
        await this.explorer.showHelp(this, nodes === null);
      },
      'show help',
      { multi: false },
    );
    this.addAction(
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
      'toggle node selection',
      { multi: false, select: true },
    );
    this.addNodeAction(
      'unselect',
      async (node) => {
        this.selectedNodes.delete(node);
        this.requestRenderNodes([node]);
      },
      'toggle node selection',
      { multi: false, select: true },
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
      { multi: false, select: true },
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

  init() {}

  addGlobalAction(
    name: ActionSyms,
    callback: (
      nodes: BaseTreeNode<any>[] | null,
      arg: string | undefined,
      mode: ActionMode,
    ) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.explorer.addGlobalAction(name, callback, description, options);
  }

  addAction(
    name: ActionSyms,
    callback: (
      nodes: TreeNode[] | null,
      arg: string | undefined,
      mode: ActionMode,
    ) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.rootActions[name] = {
      callback: (arg, mode) => callback(null, arg, mode),
      description,
      options,
    };
    this.actions[name] = {
      callback,
      description,
      options,
    };
  }

  addRootAction(
    name: ActionSyms,
    callback: (arg: string | undefined, mode: ActionMode) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.rootActions[name] = { callback, options, description };
  }

  addNodesAction(
    name: ActionSyms,
    callback: (node: TreeNode[], arg: string | undefined, mode: ActionMode) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback,
      description,
      options,
    };
  }

  addNodeAction(
    name: ActionSyms,
    callback: (node: TreeNode, arg: string | undefined, mode: ActionMode) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback: async (nodes: TreeNode[], arg, mode) => {
        for (const node of nodes) {
          await callback(node, arg, mode);
        }
      },
      description,
      options,
    };
  }

  async doRootAction(name: ActionSyms, arg: string = '', mode: ActionMode = 'n') {
    const action = this.rootActions[name];
    if (action) {
      const { render = false, reload = false } = action.options;

      await action.callback(arg, mode);

      if (reload) {
        await this.reload(this.rootNode);
      } else if (render) {
        await this.render();
      }
      return;
    }

    const globalAction = this.explorer.globalActions[name];
    if (globalAction) {
      const { render = false, reload = false } = globalAction.options;

      await globalAction.callback([this.rootNode], arg, mode);

      if (reload) {
        await this.reload(this.rootNode);
      } else if (render) {
        await this.render();
      }
      return;
    }
  }

  async doAction(
    name: ActionSyms,
    nodes: TreeNode | TreeNode[],
    arg?: string,
    mode: ActionMode = 'n',
  ) {
    const action = this.actions[name] || this.explorer.globalActions[name];
    if (!action) {
      return;
    }

    const { multi = true, render = false, reload = false, select = false } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    if (select) {
      await action.callback(finalNodes, arg, mode);
    } else if (multi) {
      if (this.selectedNodes.size > 0) {
        const nodes = Array.from(this.selectedNodes);
        this.selectedNodes.clear();
        await action.callback(nodes, arg, mode);
      } else {
        await action.callback(finalNodes, arg, mode);
      }
    } else {
      await action.callback([finalNodes[0]], arg, mode);
    }

    if (reload) {
      await this.reload(this.rootNode);
    } else if (render) {
      await this.render();
    }
  }

  async openAction(node: TreeNode, openByWinnr: (winnr: number) => Promise<void>) {
    if (openStrategy === 'vsplit') {
      await this.doAction('openInVsplit', node);
      await this.quitOnOpen();
    } else if (openStrategy === 'select') {
      await this.explorer.selectWindowsUI(
        async (winnr) => {
          await openByWinnr(winnr);
          await this.quitOnOpen();
        },
        async () => {
          await this.doAction('openInVsplit', node);
          await this.quitOnOpen();
        },
      );
    } else if (openStrategy === 'previousBuffer') {
      const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevBufnr();
      if (prevWinnr) {
        await openByWinnr(prevWinnr);
      } else {
        await this.doAction('openInVsplit', node);
      }
      await this.quitOnOpen();
    } else if (openStrategy === 'previousWindow') {
      const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevWindowID();
      if (prevWinnr) {
        await openByWinnr(prevWinnr);
      } else {
        await this.doAction('openInVsplit', node);
      }
      await this.quitOnOpen();
    } else if (openStrategy === 'originWindow') {
      const prevWinnr = await this.explorer.originWinnr();
      if (prevWinnr) {
        await openByWinnr(prevWinnr);
      } else {
        await this.doAction('openInVsplit', node);
      }
      await this.quitOnOpen();
    }
  }

  addIndexes(name: string, relativeIndex: number) {
    this.explorer.addIndexes(name, relativeIndex + this.startLine);
  }

  removeIndexes(name: string, relativeIndex: number) {
    this.explorer.removeIndexes(name, relativeIndex + this.startLine);
  }

  async copy(content: string) {
    await this.nvim.call('setreg', ['+', content]);
    await this.nvim.call('setreg', ['"', content]);
  }

  async listActionMenu(nodes: TreeNode[] | null) {
    const actions = {
      ...this.explorer.globalActions,
      ...(nodes === null ? this.rootActions : this.actions),
    };
    explorerActionList.setExplorerActions(
      Object.entries(actions)
        .sort(([aName], [bName]) => aName.localeCompare(bName))
        .map(([name, { callback, description }]) => ({
          name,
          nodes,
          mappings,
          root: nodes === null,
          key: reverseMappings[name],
          description,
          callback,
        }))
        .filter((a) => a.name !== 'actionMenu'),
    );
    const disposable = listManager.registerList(explorerActionList);
    await listManager.start(['--normal', '--number-select', explorerActionList.name]);
    disposable.dispose();
  }

  isSelectedAny() {
    return this.selectedNodes.size !== 0;
  }

  isSelectedNode(node: TreeNode) {
    return this.selectedNodes.has(node);
  }

  getNodeByLine(lineIndex: number): TreeNode {
    return this.flattenedNodes[lineIndex];
  }

  getLineByNode(node: TreeNode): number {
    if (node) {
      return this.flattenedNodes.findIndex((it) => it.uid === node.uid);
    } else {
      return 0;
    }
  }

  async currentLineIndex() {
    const cursor = await this.explorer.currentCursor();
    if (cursor) {
      return cursor.lineIndex - this.startLine;
    } else {
      return null;
    }
  }

  async gotoLineIndex(lineIndex: number, col?: number, notify = false) {
    if (lineIndex < 0) {
      lineIndex = 0;
    }
    if (lineIndex > this.height) {
      lineIndex = this.height - 1;
    }
    await this.explorer.gotoLineIndex(this.startLine + lineIndex, col, notify);
  }

  async gotoRoot({ col, notify = false }: { col?: number; notify?: boolean } = {}) {
    const finalCol = col === undefined ? await this.explorer.currentCol() : col;
    await this.gotoLineIndex(0, finalCol, notify);
  }

  /**
   * if node is null, move to root, otherwise move to node
   */
  async gotoNode(
    node: TreeNode,
    {
      lineIndex: fallbackLineIndex,
      col,
      notify = false,
    }: { lineIndex?: number; col?: number; notify?: boolean } = {},
  ) {
    const finalCol = col === undefined ? await this.explorer.currentCol() : col;
    const lineIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
    if (lineIndex !== -1) {
      await this.gotoLineIndex(lineIndex, finalCol, notify);
    } else if (fallbackLineIndex !== undefined) {
      await this.gotoLineIndex(fallbackLineIndex, finalCol, notify);
    } else {
      await this.gotoRoot({ col: finalCol, notify });
    }
  }

  abstract loadChildren(sourceNode: TreeNode): Promise<TreeNode[]>;

  async loaded(sourceNode: TreeNode): Promise<void> {
    await this.columnManager.reload(sourceNode);
  }

  /**
   * @returns return true to redraw all rows
   */
  async beforeDraw(nodes: TreeNode[], { force = false } = {}) {
    const renderAll = this.columnManager.beforeDraw(nodes);
    await hlGroupManager.emitRequestedConcealableRender(this.explorer, { force });
    return renderAll;
  }

  abstract drawRootNode(node: TreeNode): void | Promise<void>;

  drawRootMultiLine(
    _node: TreeNode,
  ): undefined | DrawMultiLineResult | Promise<DrawMultiLineResult> {
    return;
  }

  abstract drawNode(
    node: TreeNode,
    nodeIndex: number,
    options: DrawNodeOption<TreeNode>,
  ): void | Promise<void>;

  flattenByNode(node: TreeNode) {
    return [node, ...(node.children ? this.flattenByNodes(node.children) : [])];
  }

  flattenByNodes(nodes: TreeNode[]) {
    const stack = [...nodes];
    const res = [];
    while (stack.length) {
      const node = stack.shift()!;
      res.push(node);
      if (node.children && Array.isArray(node.children) && this.expandStore.isExpanded(node)) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.unshift(node.children[i]);
        }
      }
    }
    return res;
  }

  async drawNodes(nodes: TreeNode[]) {
    for (let i = 0, len = nodes.length; i < len; i++) {
      const node = nodes[i];

      if (node.isRoot) {
        await this.drawRootNode(node);
        continue;
      }

      const nodeIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
      if (nodeIndex > -1) {
        let prevSiblingNode = undefined;
        let nextSiblingNode = undefined;
        if (node.parent?.children) {
          const siblingIndex = node.parent.children.indexOf(node);
          if (siblingIndex !== -1) {
            prevSiblingNode = node.parent.children[siblingIndex - 1];
            nextSiblingNode = node.parent.children[siblingIndex + 1];
          }
        }
        await this.drawNode(node, nodeIndex, { prevSiblingNode, nextSiblingNode });
      }
    }
  }

  currentSourceIndex() {
    return this.explorer.sources.indexOf(this as ExplorerSource<any>);
  }

  opened(_notify = false): void | Promise<void> {}

  async reload(node: TreeNode, { render = true, notify = false, force = false } = {}) {
    this.selectedNodes = new Set();
    node.children = this.expandStore.isExpanded(node) ? await this.loadChildren(node) : [];
    await this.loaded(node);
    if (render) {
      await this.render({ node, notify, force });
    }
  }

  private offsetAfterLine(offset: number, afterLine: number) {
    this.explorer.indexesManager.offsetLines(offset, this.startLine + afterLine + 1);
    this.endLine += offset;
    this.explorer.sources.slice(this.currentSourceIndex() + 1).forEach((source) => {
      source.startLine += offset;
      source.offsetAfterLine(offset, source.startLine);
    });
  }

  setLines(lines: string[], startIndex: number, endIndex: number, notify = false) {
    return this.explorer.setLines(
      lines,
      this.startLine + startIndex,
      this.startLine + endIndex,
      notify,
    );
  }

  private nodeAndChildrenRange(node: TreeNode): { startIndex: number; endIndex: number } | null {
    const startIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
    if (startIndex === -1) {
      return null;
    }
    const parentLevel = node.level;
    let endIndex = this.flattenedNodes.length - 1;
    for (let i = startIndex + 1, len = this.flattenedNodes.length; i < len; i++) {
      if (this.flattenedNodes[i].level <= parentLevel) {
        endIndex = i - 1;
        break;
      }
    }
    return { startIndex, endIndex };
  }

  private async expandNodeRender(node: TreeNode, notify = false) {
    await execNotifyBlock(async () => {
      const range = this.nodeAndChildrenRange(node);
      if (!range) {
        return;
      }
      const { startIndex, endIndex } = range;
      if (this.expandStore.isExpanded(node) && node.children) {
        const flattenedNodes = this.flattenByNode(node);
        this.flattenedNodes = this.flattenedNodes
          .slice(0, startIndex)
          .concat(flattenedNodes)
          .concat(this.flattenedNodes.slice(endIndex + 1));
        if (await this.beforeDraw(flattenedNodes)) {
          return this.render();
        }
        this.offsetAfterLine(flattenedNodes.length - 1, startIndex);
        await this.drawNodes(flattenedNodes);
        await this.setLines(
          flattenedNodes.map((node) => node.drawnLine),
          startIndex,
          endIndex + 1,
          true,
        );
        await this.gotoLineIndex(startIndex, 1);
      }
    }, notify);
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

  async expandNode(node: TreeNode, { recursive = false, notify = false } = {}) {
    await execNotifyBlock(async () => {
      await this.expandNodeRecursive(node, recursive);
      await this.expandNodeRender(node, true);
      await this.gotoNode(node, { notify: true });
    }, notify);
  }

  private async collapseNodeRender(node: TreeNode, notify = false) {
    await execNotifyBlock(async () => {
      const range = this.nodeAndChildrenRange(node);
      if (!range) {
        return;
      }
      const { startIndex, endIndex } = range;
      this.flattenedNodes.splice(startIndex + 1, endIndex - startIndex);
      this.explorer.indexesManager.removeLines(
        this.startLine + startIndex + 1,
        this.startLine + endIndex,
      );
      if (await this.beforeDraw([node])) {
        return this.render();
      }
      this.offsetAfterLine(-(endIndex - startIndex), endIndex);
      await this.drawNodes([node]);
      await this.setLines([node.drawnLine], startIndex, endIndex + 1, true);
      await this.gotoLineIndex(startIndex, 1);
    }, notify);
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

  async collapseNode(node: TreeNode, { recursive = false, notify = false } = {}) {
    await execNotifyBlock(async () => {
      await this.collapseNodeRecursive(node, recursive);
      await this.collapseNodeRender(node, true);
      await this.gotoNode(node, { notify: true });
    }, notify);
  }

  requestRenderNodes(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      this.requestedRenderNodes.add(node);
    });
  }

  async emitRequestRenderNodes(notify = false) {
    if (this.requestedRenderNodes.size > 0) {
      await this.renderNodes(Array.from(this.requestedRenderNodes), notify);
      this.requestedRenderNodes.clear();
    }
  }

  async renderNodes(nodes: TreeNode[], notify = false) {
    if (await this.beforeDraw(nodes)) {
      return this.render();
    }
    await execNotifyBlock(async () => {
      await Promise.all(
        nodes.map(async (node) => {
          const nodeIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
          if (nodeIndex === -1) {
            return;
          }
          await this.drawNodes([node]);
          await this.setLines([node.drawnLine], nodeIndex, nodeIndex + 1, true);
        }),
      );
    }, notify);
  }

  async render({ node = this.rootNode, notify = false, storeCursor = true, force = false } = {}) {
    if (this.explorer.isHelpUI) {
      return;
    }

    const { nvim } = this;

    let restore: ((notify: boolean) => Promise<void>) | null = null;
    if (storeCursor) {
      restore = await this.explorer.storeCursor();
    }

    await execNotifyBlock(async () => {
      const range = this.nodeAndChildrenRange(node);
      if (!range && node !== this.rootNode) {
        return;
      }

      const { startIndex: nodeIndex, endIndex } = range
        ? range
        : { startIndex: 0, endIndex: this.flattenedNodes.length - 1 };
      const oldHeight = endIndex - nodeIndex + 1;
      const flattenedNodes = this.flattenByNode(node);
      const newHeight = flattenedNodes.length;
      this.flattenedNodes = this.flattenedNodes
        .slice(0, nodeIndex)
        .concat(flattenedNodes)
        .concat(this.flattenedNodes.slice(endIndex + 1));

      if (newHeight < oldHeight) {
        this.explorer.indexesManager.removeLines(
          this.startLine + newHeight + 1,
          this.startLine + oldHeight + 1,
        );
      }
      this.offsetAfterLine(newHeight - oldHeight, this.endLine);
      await this.beforeDraw(this.flattenedNodes, { force });
      await this.drawNodes(this.flattenedNodes);

      const sourceIndex = this.currentSourceIndex();
      const isLastSource = this.explorer.sources.length - 1 == sourceIndex;

      await this.explorer.setLines(
        this.flattenedNodes.map((node) => node.drawnLine),
        this.startLine,
        isLastSource ? -1 : this.startLine + oldHeight,
        true,
      );

      if (restore) {
        await restore(true);
      }

      if (workspace.env.isVim) {
        nvim.command('redraw', true);
      }
    }, notify);
  }

  async quitOnOpen() {
    if (config.get<boolean>('quitOnOpen')) {
      await this.explorer.quit();
    }
  }
}
