import { Buffer, Disposable, listManager, workspace } from 'coc.nvim';
import { Range } from 'vscode-languageserver-protocol';
import { explorerActionList } from '../lists/actions';
import { Explorer } from '../explorer';
import { onError } from '../logger';
import { Action, ActionSyms, mappings, reverseMappings, ActionMode } from '../mappings';
import { config, execNotifyBlock } from '../util';
import { SourceRowBuilder, SourceViewBuilder } from './view-builder';
import { hlGroupManager } from './highlight-manager';
import { ColumnManager } from './column-manager';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
  select: boolean;
};

export const enableNerdfont = config.get<string>('icon.enableNerdfont')!;

export const sourceIcons = {
  expanded: config.get<string>('icon.expanded') || (enableNerdfont ? '' : '-'),
  shrinked: config.get<string>('icon.shrinked') || (enableNerdfont ? '' : '+'),
  selected: config.get<string>('icon.selected')!,
  unselected: config.get<string>('icon.unselected')!,
};

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
  arg: hl('HelpArg', 'Identifier'),
  description: hl('HelpDescription', 'Comment'),
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
    shrink(node: TreeNode) {
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
      callback: (nodes: TreeNode[], arg: string, mode: ActionMode) => void | Promise<void>;
    }
  > = {};
  rootActions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (arg: string, mode: ActionMode) => void | Promise<void>;
    }
  > = {};
  hlIds: number[] = []; // hightlight match ids for vim8.0
  nvim = workspace.nvim;

  private requestedRenderNodes: Set<TreeNode> = new Set();

  constructor(public sourceName: string, public explorer: Explorer, expanded: boolean) {
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
        await this.reload(this.rootNode);
      },
      'refresh',
      { multi: false },
    );
    this.addAction(
      'help',
      async (nodes) => {
        await this.renderHelp(nodes === null);
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

    setImmediate(() => {
      Promise.resolve(this.init()).catch(onError);
      this.expanded = expanded;
    });
  }

  /**
   * @returns winnr
   */
  async prevWinnr() {
    const winnr = (await this.nvim.call('bufwinnr', [
      this.explorer.explorerManager.previousBufnr,
    ])) as number;
    if ((await this.explorer.winnr) !== winnr && winnr > 0) {
      return winnr;
    } else {
      return null;
    }
  }

  get expanded() {
    return this.expandStore.isExpanded(this.rootNode);
  }

  set expanded(expanded: boolean) {
    if (expanded) {
      this.expandStore.expand(this.rootNode);
    } else {
      this.expandStore.shrink(this.rootNode);
    }
  }

  get height() {
    return this.flattenedNodes.length;
  }

  init() {}

  addGlobalAction(
    name: ActionSyms,
    callback: (
      nodes: BaseTreeNode<any>[] | null,
      arg: string,
      mode: ActionMode,
    ) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.explorer.addGlobalAction(name, callback, description, options);
  }

  addAction(
    name: ActionSyms,
    callback: (nodes: TreeNode[] | null, arg: string, mode: ActionMode) => void | Promise<void>,
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
    callback: (arg: string, mode: ActionMode) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.rootActions[name] = { callback, options, description };
  }

  addNodesAction(
    name: ActionSyms,
    callback: (node: TreeNode[], arg: string, mode: ActionMode) => void | Promise<void>,
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
    callback: (node: TreeNode, arg: string, mode: ActionMode) => void | Promise<void>,
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
    const action = this.rootActions[name] || this.explorer.globalActions[name];
    if (!action) {
      return;
    }

    const { render = false, reload = false } = action.options;

    await action.callback(arg, mode);

    if (reload) {
      await this.reload(this.rootNode);
    } else if (render) {
      await this.render();
    }
  }

  async doAction(
    name: ActionSyms,
    nodes: TreeNode | TreeNode[],
    arg: string = '',
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
  async beforeDraw(nodes: TreeNode[]) {
    return this.columnManager.beforeDraw(nodes);
  }

  abstract drawNode(
    node: TreeNode,
    nodeIndex: number,
    prevNode: TreeNode,
    nextNode: TreeNode,
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
    // const isRedrawAll = await this.beforeDraw(nodes);
    // if (isRedrawAll) {
    //   await this.render();
    //   return;
    // }
    //
    for (let i = 0, len = nodes.length; i < len; i++) {
      const node = nodes[i];
      const nodeIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
      if (nodeIndex > -1) {
        const prevNode = i === 0 ? this.flattenedNodes[nodeIndex - 1] : nodes[i - 1];
        const nextNode = i === len - 1 ? this.flattenedNodes[nodeIndex + 1] : nodes[i + 1];
        await this.drawNode(node, nodeIndex, prevNode, nextNode);
      }
    }
  }

  currentSourceIndex() {
    return this.explorer.sources.indexOf(this);
  }

  opened(_notify = false): void | Promise<void> {}

  async reload(
    sourceNode: TreeNode,
    { render = true, notify = false }: { buffer?: Buffer; render?: boolean; notify?: boolean } = {},
  ) {
    this.selectedNodes = new Set();
    this.rootNode.children = this.expanded ? await this.loadChildren(sourceNode) : [];
    await this.loaded(sourceNode);
    if (render) {
      await this.render({ notify });
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

  private async expandNodeRender(node: TreeNode, notify = false) {
    await execNotifyBlock(async () => {
      const nodeIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
      if (nodeIndex === -1) {
        return;
      }
      const parentLevel = node.level;
      let endIndex = this.flattenedNodes.length;
      for (let i = nodeIndex + 1, len = this.flattenedNodes.length; i < len; i++) {
        if (this.flattenedNodes[i].level <= parentLevel) {
          endIndex = i;
          break;
        }
      }
      if (this.expandStore.isExpanded(node) && node.children) {
        const flattenedNodes = this.flattenByNode(node);
        this.flattenedNodes = this.flattenedNodes
          .slice(0, nodeIndex)
          .concat(flattenedNodes)
          .concat(this.flattenedNodes.slice(endIndex));
        if (await this.beforeDraw(flattenedNodes)) {
          return this.render();
        }
        this.offsetAfterLine(flattenedNodes.length - 1, nodeIndex + 1);
        await this.drawNodes(flattenedNodes);
        await this.setLines(
          flattenedNodes.map((node) => node.drawnLine),
          nodeIndex,
          endIndex,
          true,
        );
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

  private async shrinkNodeRender(node: TreeNode, notify = false) {
    await execNotifyBlock(async () => {
      const nodeIndex = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
      if (nodeIndex === -1) {
        return;
      }
      const parentLevel = node.level;
      let endIndex = this.flattenedNodes.length;
      for (let i = nodeIndex + 1, len = this.flattenedNodes.length; i < len; i++) {
        if (this.flattenedNodes[i].level <= parentLevel) {
          endIndex = i;
          break;
        }
      }
      this.flattenedNodes.splice(nodeIndex + 1, endIndex - (nodeIndex + 1));
      this.explorer.indexesManager.removeLines(
        this.startLine + nodeIndex + 1,
        this.startLine + endIndex,
      );
      if (await this.beforeDraw([node])) {
        return this.render();
      }
      this.offsetAfterLine(-(endIndex - (nodeIndex + 1)), endIndex);
      await this.drawNodes([node]);
      await this.setLines([node.drawnLine], nodeIndex, endIndex, true);
    }, notify);
  }

  private async shrinkNodeRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.expandStore.shrink(node);
      if (recursive || config.get<boolean>('autoShrinkChildren')!) {
        if (node.children) {
          for (const child of node.children) {
            await this.shrinkNodeRecursive(child, recursive);
          }
        }
      }
    }
  }

  async shrinkNode(node: TreeNode, { recursive = false, notify = false } = {}) {
    await execNotifyBlock(async () => {
      await this.shrinkNodeRecursive(node, recursive);
      await this.shrinkNodeRender(node, true);
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

  async render({
    notify = false,
    storeCursor = true,
  }: { notify?: boolean; storeCursor?: boolean } = {}) {
    if (this.explorer.isHelpUI) {
      return;
    }

    const { nvim } = this;

    let restore: ((notify: boolean) => Promise<void>) | null = null;
    if (storeCursor) {
      restore = await this.explorer.storeCursor();
    }

    await execNotifyBlock(async () => {
      const oldHeight = this.flattenedNodes.length;
      this.flattenedNodes = this.flattenByNode(this.rootNode);
      const newHeight = this.flattenedNodes.length;

      if (newHeight < oldHeight) {
        this.explorer.indexesManager.removeLines(
          this.startLine + newHeight + 1,
          this.startLine + oldHeight + 1,
        );
      }
      this.offsetAfterLine(newHeight - oldHeight, this.endLine);
      await this.beforeDraw(this.flattenedNodes);
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

  async renderHelp(isRoot: boolean) {
    this.explorer.isHelpUI = true;
    const builder = new SourceViewBuilder();
    const width = await this.nvim.call('winwidth', '%');
    const storeCursor = await this.explorer.storeCursor();
    const lines: string[] = [];

    lines.push(
      builder.drawLine((row) => {
        row.add(
          `Help for [${this.sourceName}${
            isRoot ? ' root' : ''
          }], (use q or <esc> return to explorer)`,
        );
      }),
    );
    lines.push(
      builder.drawLine((row) => {
        row.add('—'.repeat(width), helpHightlights.line);
      }),
    );

    const registeredActions = {
      ...this.explorer.globalActions,
      ...(isRoot ? this.rootActions : this.actions),
    };
    const drawAction = (row: SourceRowBuilder, action: Action) => {
      row.add(action.name, helpHightlights.action);
      if (action.arg) {
        row.add(`(${action.arg})`, helpHightlights.arg);
      }
      row.add(' ');
      row.add(registeredActions[action.name].description, helpHightlights.description);
    };
    Object.entries(mappings).forEach(([key, actions]) => {
      if (!actions.every((action) => action.name in registeredActions)) {
        return;
      }
      lines.push(
        builder.drawLine((row) => {
          row.add(' ');
          row.add(key, helpHightlights.mappingKey);
          row.add(' - ');
          drawAction(row, actions[0]);
        }),
      );
      actions.slice(1).forEach((action) => {
        lines.push(
          builder.drawLine((row) => {
            row.add(' '.repeat(key.length + 4));

            drawAction(row, action);
          }),
        );
      });
    });

    await execNotifyBlock(async () => {
      await this.explorer.setLines(lines, 0, -1, true);
    });

    await this.explorer.explorerManager.clearMappings();

    const disposables: Disposable[] = [];
    await new Promise((resolve) => {
      ['<esc>', 'q'].forEach((key) => {
        disposables.push(
          workspace.registerLocalKeymap(
            'n',
            key,
            () => {
              resolve();
            },
            true,
          ),
        );
      });
    });
    disposables.forEach((d) => d.dispose());

    await this.quitHelp();
    await this.explorer.renderAll({ storeCursor: false });
    await storeCursor();
  }

  async quitHelp() {
    await this.explorer.explorerManager.executeMappings();
    this.explorer.isHelpUI = false;
  }

  async quitOnOpen() {
    if (config.get<boolean>('quitOnOpen')) {
      await this.explorer.quit();
    }
  }
}
