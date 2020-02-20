import { listManager, workspace, ExtensionContext, Disposable, IList, Uri } from 'coc.nvim';
import { explorerActionList } from '../lists/actions';
import { Explorer } from '../explorer';
import { onError } from '../logger';
import { mappings, reverseMappings } from '../mappings';
import {
  config,
  execNotifyBlock,
  getOpenStrategy,
  getEnableNerdfont,
  delay,
  onEvents,
  PreviewStrategy,
  getPreviewStrategy,
  OpenStrategy,
  skipOnEventsByWinnrs,
} from '../util';
import { SourceViewBuilder } from './view-builder';
import {
  HighlightPosition,
  HighlightPositionWithLine,
  HighlightConcealablePosition,
} from './highlight-manager';
import { TemplateRenderer, DrawLabelingResult } from './template-renderer';
import { argOptions } from '../parse-args';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
  select: boolean;
};

export const sourceIcons = {
  getExpanded: () => config.get<string>('icon.expanded') || (getEnableNerdfont() ? '' : '-'),
  getCollapsed: () => config.get<string>('icon.collapsed') || (getEnableNerdfont() ? '' : '+'),
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
  concealHighlightPositions?: HighlightConcealablePosition[];
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
    generateUri: (path: string) => this.scheme + '://' + path,
  };
  templateRenderer?: TemplateRenderer<TreeNode>;

  actions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (nodes: TreeNode[], arg?: string) => void | Promise<void>;
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
        await this.reload(this.rootNode, { force: true });

        await execNotifyBlock(async () => {
          this.clearHighlightsNotify();
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
          await this.executeHighlightsNotify(highlights);
          await this.executeConcealableHighlight({ isNotify: true });
        });
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

  abstract open(isNotify: boolean): Promise<void>;

  async opened(_isFirst: boolean, _isNotify: boolean) {}

  addNodesAction(
    name: string,
    callback: (nodes: TreeNode[], arg?: string) => void | Promise<void>,
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
    callback: (node: TreeNode, arg: string | undefined) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback: async (nodes: TreeNode[], arg) => {
        for (const node of nodes) {
          await callback(node, arg);
        }
      },
      description,
      options,
    };
  }

  async doAction(name: string, nodes: TreeNode | TreeNode[], arg?: string) {
    const action = this.actions[name] || this.explorer.globalActions[name];
    if (!action) {
      return;
    }

    const { multi = false, render = false, reload = false, select = false } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    if (select) {
      await action.callback(finalNodes, arg);
    } else if (multi) {
      if (this.selectedNodes.size > 0) {
        const nodes = Array.from(this.selectedNodes);
        this.selectedNodes.clear();
        this.requestRenderNodes(nodes);
        await action.callback(nodes, arg);
      } else {
        await action.callback(finalNodes, arg);
      }
    } else {
      await action.callback([finalNodes[0]], arg);
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
    const curWinnr = await nvim.call('winnr');
    const openByWinnr =
      originalOpenByWinnr ??
      (async (winnr: number) => {
        if (curWinnr !== winnr) {
          await skipOnEventsByWinnrs([winnr]);
        }
        await nvim.command(`${winnr}wincmd w`);
        await nvim.command(`edit ${await getURI()}`);
      });
    const actions: Record<OpenStrategy, () => void | Promise<void>> = {
      select: async () => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating') {
          await this.explorer.quit();
        }
        await this.explorer.selectWindowsUI(
          async (winnr) => {
            await openByWinnr(winnr);
            await this.explorer.quitOnOpen();
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
      split: async () => {
        // TODO split like vscode
        await nvim.command(`split ${await getURI()}`);
        await this.explorer.quitOnOpen();
      },
      vsplit: async () => {
        await execNotifyBlock(async () => {
          nvim.command(`vsplit ${await getURI()}`, true);
          const position = await this.explorer.args.value(argOptions.position);
          if (position === 'left') {
            nvim.command('wincmd L', true);
          } else if (position === 'right') {
            nvim.command('wincmd H', true);
          } else if (position === 'tab') {
            nvim.command('wincmd L', true);
          }
          await this.explorer.quitOnOpen();
        });
      },
      tab: async () => {
        await this.explorer.quitOnOpen();
        await nvim.command(`tabedit ${await getURI()}`);
      },
      previousBuffer: async () => {
        const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevBufnr();
        if (prevWinnr) {
          await openByWinnr(prevWinnr);
        } else {
          await actions.vsplit();
        }
        await this.explorer.quitOnOpen();
      },
      previousWindow: async () => {
        const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevWindowID();
        if (prevWinnr) {
          await openByWinnr(prevWinnr);
        } else {
          await actions.vsplit();
        }
        await this.explorer.quitOnOpen();
      },
      sourceWindow: async () => {
        const srcWinnr = await this.explorer.sourceWinnr();
        if (srcWinnr) {
          await openByWinnr(srcWinnr);
        } else {
          await actions.vsplit();
        }
        await this.explorer.quitOnOpen();
      },
    };
    await actions[openStrategy || getOpenStrategy()]();
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
    const isFloating = (await this.explorer.args.value(argOptions.position)) === 'floating';
    if (isFloating) {
      await this.explorer.hide();
    }

    let isResolve = false;
    let showExplorer = async () => {};
    const promise = new Promise(async (resolve) => {
      showExplorer = async () => {
        if (isFloating && !isResolve) {
          isResolve = true;
          // TODO FIXME remove delay
          await delay(200);
          await this.explorer.show();
          resolve();
        }
      };
      const disposable = listManager.registerList(list);
      await listManager.start(['--normal', '--number-select', list.name]);
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
        if (isFloating && !isResolve) {
          await showExplorer();
        }
        resolve();
      });
    });
    return {
      resolve: showExplorer,
      done() {
        return promise;
      },
    };
  }

  async listActionMenu(nodes: TreeNode[]) {
    const actions = {
      ...this.explorer.globalActions,
      ...this.actions,
    };

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
            callback(nodes);
            await task.resolve();
          },
        }))
        .filter((a) => a.name !== 'actionMenu'),
    );
    const task = await this.startCocList(explorerActionList);
    await task.done();
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

  getLineByNode(node: TreeNode): number {
    if (node) {
      return this.flattenedNodes.findIndex((it) => it.uri === node.uri);
    } else {
      return 0;
    }
  }

  async currentLineIndex() {
    const cursor = await this.explorer.currentCursor();
    if (cursor) {
      return cursor.lineIndex - this.startLineIndex;
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
    await this.explorer.gotoLineIndex(this.startLineIndex + lineIndex, col, notify);
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
    const lineIndex = this.flattenedNodes.findIndex((it) => it.uri === node.uri);
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
    await this.templateRenderer?.reload(sourceNode);
  }

  /**
   * @returns return true to redraw all rows
   */
  async beforeDraw(nodes: TreeNode[], { force = false } = {}) {
    const renderAll = await this.templateRenderer?.beforeDraw(nodes);
    return !!renderAll;
  }

  drawRootLabeling(_node: TreeNode): undefined | DrawLabelingResult | Promise<DrawLabelingResult> {
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
      if (node.children && Array.isArray(node.children) && this.expandStore.isExpanded(node)) {
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

        const nodeIndex = this.flattenedNodes.findIndex((it) => it.uri === node.uri);
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

  async executeHighlightsNotify(highlights: HighlightPositionWithLine[]) {
    await this.explorer.executeHighlightsNotify(this.hlSrcId, highlights);
  }

  async executeConcealableHighlight({ isNotify = false } = {}) {
    await this.explorer.executeConcealableHighlight({ isNotify });
  }

  currentSourceIndex() {
    return this.explorer.sources.indexOf(this as ExplorerSource<any>);
  }

  async reload(node: TreeNode, { render = true, notify = false, force = false } = {}) {
    await this.explorer.refreshWidth();
    this.selectedNodes = new Set();
    node.children = this.expandStore.isExpanded(node) ? await this.loadChildren(node) : [];
    await this.loaded(node);
    if (render) {
      await this.render({ node, notify, force });
    }
  }

  private offsetAfterLine(offset: number, afterLine: number) {
    this.explorer.indexesManager.offsetLines(offset, this.startLineIndex + afterLine + 1);
    this.endLineIndex += offset;
    this.explorer.sources.slice(this.currentSourceIndex() + 1).forEach((source) => {
      source.startLineIndex += offset;
      source.offsetAfterLine(offset, source.startLineIndex);
    });
  }

  setLines(lines: string[], startIndex: number, endIndex: number, notify = false) {
    return this.explorer.setLines(
      lines,
      this.startLineIndex + startIndex,
      this.startLineIndex + endIndex,
      notify,
    );
  }

  private nodeAndChildrenRange(node: TreeNode): { startIndex: number; endIndex: number } | null {
    const startIndex = this.flattenedNodes.findIndex((it) => it.uri === node.uri);
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
        if (await this.beforeDraw(flattenedNodes)) {
          return this.render();
        }
        this.flattenedNodes = this.flattenedNodes
          .slice(0, startIndex)
          .concat(flattenedNodes)
          .concat(this.flattenedNodes.slice(endIndex + 1));
        this.offsetAfterLine(flattenedNodes.length - 1, startIndex);
        const highlights = await this.drawNodes(flattenedNodes);
        await this.setLines(
          flattenedNodes.map((node) => node.drawnLine),
          startIndex,
          endIndex + 1,
          true,
        );
        await this.executeHighlightsNotify(highlights);
        await this.executeConcealableHighlight({ isNotify: true });
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
      if (await this.beforeDraw([node])) {
        return this.render();
      }
      const { startIndex, endIndex } = range;
      this.flattenedNodes.splice(startIndex + 1, endIndex - startIndex);
      this.explorer.indexesManager.removeLines(
        this.startLineIndex + startIndex + 1,
        this.startLineIndex + endIndex,
      );
      this.offsetAfterLine(-(endIndex - startIndex), endIndex);
      const highlights = await this.drawNodes([node]);
      await this.setLines([node.drawnLine], startIndex, endIndex + 1, true);
      await this.executeHighlightsNotify(highlights);
      await this.executeConcealableHighlight({ isNotify: true });
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
    const highlights: HighlightPositionWithLine[] = [];
    await execNotifyBlock(async () => {
      await Promise.all(
        nodes.map(async (node) => {
          const nodeIndex = this.flattenedNodes.findIndex((it) => it.uri === node.uri);
          if (nodeIndex === -1) {
            return;
          }
          highlights.push(...(await this.drawNodes([node])));
          await this.setLines([node.drawnLine], nodeIndex, nodeIndex + 1, true);
        }),
      );
      await this.executeHighlightsNotify(highlights);
      await this.executeConcealableHighlight({ isNotify: true });
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
          this.startLineIndex + newHeight + 1,
          this.startLineIndex + oldHeight + 1,
        );
      }
      this.offsetAfterLine(newHeight - oldHeight, this.endLineIndex);
      await this.beforeDraw(this.flattenedNodes, { force });
      const highlights = await this.drawNodes(this.flattenedNodes);

      const sourceIndex = this.currentSourceIndex();
      const isLastSource = this.explorer.sources.length - 1 == sourceIndex;

      await this.explorer.setLines(
        this.flattenedNodes.map((node) => node.drawnLine),
        this.startLineIndex,
        isLastSource ? -1 : this.startLineIndex + oldHeight,
        true,
      );
      await this.executeHighlightsNotify(highlights);
      await this.executeConcealableHighlight();

      if (restore) {
        await restore(true);
      }

      if (workspace.env.isVim) {
        nvim.command('redraw', true);
      }
    }, notify);
  }
}
