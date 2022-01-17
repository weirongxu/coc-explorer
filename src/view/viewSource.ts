import { Disposable, workspace } from 'coc.nvim';
import { clone } from 'lodash-es';
import { Explorer } from '../explorer';
import { ColumnRegistrar } from '../source/columnRegistrar';
import { BaseTreeNode, ExplorerSource, SourceOptions } from '../source/source';
import { SourcePainters } from '../source/sourcePainters';
import { rendererExplorerSymbol } from './rendererExplorer';
import { RendererSource, rendererSourceSymbol } from './rendererSource';
import { ViewNodeStores } from './viewNodeStores';

export class ViewSource<
  TreeNode extends BaseTreeNode<TreeNode, Type>,
  Type extends string = TreeNode['type'],
> implements Disposable
{
  readonly explorer: Explorer;
  /**
   * rendered nodes
   */
  flattenedNodes: TreeNode[] = [];
  startLineIndex = 0;
  endLineIndex = 0;
  sourcePainters: SourcePainters<TreeNode>;

  [rendererSourceSymbol]: RendererSource<TreeNode>;

  get isHelpUI() {
    return this.explorer.view.isHelpUI;
  }

  get config() {
    return this.source.config;
  }

  private readonly nodeStores: ViewNodeStores<TreeNode>;

  rootExpandedForOpen = false;

  constructor(
    public readonly source: ExplorerSource<any>,
    private columnRegistrar: ColumnRegistrar<TreeNode, any>,
    public readonly rootNode: TreeNode,
  ) {
    this.explorer = this.source.explorer;
    this.nodeStores = new ViewNodeStores(this);
    this.sourcePainters = new SourcePainters<TreeNode>(
      this.source,
      this.columnRegistrar,
    );

    this[rendererSourceSymbol] = new RendererSource(this);
  }

  async sync<T>(
    block: (renderer: RendererSource<TreeNode>) => Promise<T>,
  ): Promise<T> {
    return await this.explorer.view[rendererExplorerSymbol].runQueue(() =>
      block(this[rendererSourceSymbol]),
    );
  }

  /**
   * request render nodes, it will render the node when finished the action
   */
  requestRenderNodes(nodes: SourceOptions.RenderNodes<TreeNode>) {
    for (const node of nodes) {
      this[rendererSourceSymbol].requestedRenderNodes.add(node);
    }
  }

  dispose(): void {
    this.sourcePainters.dispose();
  }

  bootInit(rootExpandedForOpen: boolean) {
    this.rootExpandedForOpen = rootExpandedForOpen;
  }

  bootOpen() {
    this.nodeStores.setExpanded(this.rootNode, this.rootExpandedForOpen);
  }

  async load(node: TreeNode) {
    await this.sourcePainters.load(node);
  }

  async parseTemplate(type: Type, template: string, labelingTemplate?: string) {
    return await this.sourcePainters.parseTemplate(
      type,
      template,
      labelingTemplate,
    );
  }

  /**
   * Relative line index for source
   */
  get currentLineIndex() {
    return this.explorer.view.currentLineIndex - this.startLineIndex;
  }

  currentNode() {
    return this.flattenedNodes[this.currentLineIndex] as TreeNode | undefined;
  }

  currentSourceIndex(): number | undefined {
    const indexOf = this.explorer.sources.indexOf(this.source);
    return indexOf === -1 ? undefined : indexOf;
  }

  getNodeByLine(lineIndex: number): TreeNode | undefined {
    return this.flattenedNodes[lineIndex];
  }

  /**
   * Get relative line index for source by node
   */
  getLineByNode(node: TreeNode): undefined | number {
    if (node) {
      const line = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
      return line === -1 ? undefined : line;
    } else {
      return 0;
    }
  }

  setLinesNotifier(lines: string[], startIndex: number, endIndex: number) {
    return this.explorer.setLinesNotifier(
      lines,
      this.startLineIndex + startIndex,
      this.startLineIndex + endIndex,
    );
  }

  protected replaceNodeInSibling<TreeNode extends BaseTreeNode<TreeNode>>(
    oldNode: TreeNode,
    newNode: TreeNode,
  ) {
    if (oldNode.parent?.children) {
      const index = oldNode.parent.children.indexOf(oldNode);
      if (index !== -1) {
        oldNode.parent.children.splice(index, 1, newNode);
        newNode.level = oldNode.level;
        newNode.parent = oldNode.parent;
        newNode.prevSiblingNode = oldNode.prevSiblingNode;
        newNode.nextSiblingNode = oldNode.nextSiblingNode;
      }
    }
  }

  /**
   * get all parents
   */
  flattenParents(node: TreeNode): TreeNode[] {
    let currentNode = node;
    const result: TreeNode[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (currentNode.parent) {
        result.push(currentNode.parent);
        currentNode = currentNode.parent;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * get current node and all children flattened nodes
   */
  flattenNode(node: TreeNode): TreeNode[] {
    const result: TreeNode[] = [];
    const stack = [node];

    while (stack.length) {
      let node: TreeNode = stack.shift()!;

      // compact
      if (!node.isRoot) {
        const compactStatus = this.nodeStores.getCompact(node);
        if (compactStatus === 'compact') {
          if (
            !node.compactedNodes &&
            node.children?.length === 1 &&
            node.children[0].expandable
          ) {
            /**
             * compact
             * --------------------------------------
             * └──node/         =>   └──node/subnode/
             *    └──subnode/           └──file
             *       └──file
             */
            let tail = node.children[0];
            const compactedNodes = [node, tail];
            while (tail.children?.length === 1 && tail.children[0].expandable) {
              this.nodeStores.setCompact(tail, 'compact');
              tail = tail.children[0];
              compactedNodes.push(tail);
            }
            this.nodeStores.setCompact(tail, 'compact');
            const compactedNode = clone(tail);
            compactedNode.name = compactedNodes.map((n) => n.name).join('/');
            compactedNode.compactedNodes = compactedNodes;
            compactedNode.compactedLastNode = tail;
            // use compactedNode instead of node
            this.replaceNodeInSibling(node, compactedNode);
            node = compactedNode;
          }
        } else if (compactStatus === 'uncompact') {
          if (node.compactedNodes) {
            /**
             * uncompact
             * -------------------------------------
             * └──topNode/node/  =>   └──topNode/
             *    └──file                └──node/
             *                              └──file
             */
            const topNode = node.compactedNodes[0];
            for (const n of node.compactedNodes) {
              this.nodeStores.setCompact(n, 'uncompact');
            }
            // use topNode instead of compactedNode
            this.replaceNodeInSibling(node, topNode);
            node = topNode;
          }
        }
      }

      result.push(node);

      if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          node.children[i].parent = node;
          node.children[i].level = (node.level ?? 0) + 1;
          stack.unshift(node.children[i]);
        }
      }
    }

    return result;
  }

  isExpanded(node: TreeNode) {
    return this.nodeStores.isExpanded(node);
  }

  // render
  private async expandRender(node: TreeNode) {
    if (this.isHelpUI) {
      return;
    }
    if (!this.isExpanded(node) || !node.children) {
      return;
    }
    await this.sync(async (r) => {
      const range = r.nodeAndChildrenRange(node);
      if (!range) {
        return;
      }
      const { startIndex, endIndex } = range;
      const needDrawNodes = this.flattenNode(node);

      await this.sourcePainters.drawPre(needDrawNodes, {
        draw: async () => {
          this.flattenedNodes = this.flattenedNodes
            .slice(0, startIndex)
            .concat(needDrawNodes)
            .concat(this.flattenedNodes.slice(endIndex + 1));
          this.source.locator.mark.offsetAfterLine(
            needDrawNodes.length - 1 - (endIndex - startIndex),
            startIndex,
          );
          const { contents, highlightPositions } = await r.drawNodes(
            needDrawNodes,
          );
          await this.source.events.fire('drawn');

          workspace.nvim.pauseNotification();
          this.setLinesNotifier(contents, startIndex, endIndex + 1).notify();
          this.source.highlight.addHighlightsNotify(highlightPositions);
          if (workspace.isVim) {
            workspace.nvim.command('redraw', true);
          }
          await workspace.nvim.resumeNotification();
        },
        drawAll: async () => (await r.renderNotifier()).run(),
      });
    });
  }

  private async expandRecursive(
    node: TreeNode,
    options: SourceOptions.ExpandNode,
  ) {
    const autoExpandOptions = this.config.get('autoExpandOptions');
    const compact = options.compact ?? autoExpandOptions.includes('compact');
    const uncompact =
      options.uncompact ?? autoExpandOptions.includes('uncompact');
    const recursiveSingle =
      options.recursiveSingle ??
      (autoExpandOptions.includes('recursiveSingle') || compact);
    if (node.expandable) {
      const depth = options.depth ?? 1;
      const isExpanded = this.isExpanded(node);
      this.nodeStores.expand(node);
      if (!node.children) {
        node.children = await this.source.loadInitedChildren(node, {
          recursiveExpanded: true,
        });
      }

      if (depth > this.config.get('autoExpandMaxDepth')) {
        return;
      }

      const singleExpandableNode =
        node.children.length === 1 && node.children[0].expandable;

      const compactStatus = this.nodeStores.getCompact(node);
      if (compactStatus === 'uncompact') {
        /**
         * └──topNode&node/
         *    └──subnode/
         *       └──file
         */
        if (singleExpandableNode && compact) {
          this.nodeStores.setCompact(node, 'compact');
        }
      } else if (compactStatus === 'compact') {
        /**
         * └──topNode/node/
         *    └──file
         */
        if (isExpanded && uncompact) {
          this.nodeStores.setCompact(node, 'uncompact');
        } else {
          this.nodeStores.setCompact(node, 'compact');
        }
      }

      if (options.recursive || (singleExpandableNode && recursiveSingle)) {
        await Promise.all(
          node.children.map(async (child) => {
            await this.expandRecursive(child, {
              ...options,
              depth: depth + 1,
            });
          }),
        );
      }
    }
  }

  /**
   * expand node
   */
  async expand(node: TreeNode, options: SourceOptions.ExpandNode = {}) {
    await this.expandRecursive(node, options);
    if (options.render ?? true) {
      await this.expandRender(node);
    }
  }

  private async collapseRender(node: TreeNode) {
    if (this.isHelpUI || this.isExpanded(node)) {
      return;
    }

    await this.sync(async (r) => {
      const range = r.nodeAndChildrenRange(node);
      if (!range) {
        return;
      }

      await this.sourcePainters.drawPre([node], {
        draw: async () => {
          const { startIndex, endIndex } = range;
          this.flattenedNodes.splice(startIndex + 1, endIndex - startIndex);
          this.explorer.locator.mark.removeLines(
            this.startLineIndex + startIndex + 1,
            this.startLineIndex + endIndex,
          );
          this.source.locator.mark.offsetAfterLine(
            -(endIndex - startIndex),
            endIndex,
          );
          const gotoNotifier = await this.source.locator.gotoLineIndexNotifier(
            startIndex,
            0,
          );
          const { contents, highlightPositions } = await r.drawNodes([node]);
          await this.source.events.fire('drawn');

          workspace.nvim.pauseNotification();
          this.setLinesNotifier(contents, startIndex, endIndex + 1).notify();
          this.source.highlight.addHighlightsNotify(highlightPositions);
          gotoNotifier.notify();
          if (workspace.isVim) {
            workspace.nvim.command('redraw', true);
          }
          await workspace.nvim.resumeNotification();
        },
        drawAll: async () => (await r.renderNotifier()).run(),
      });
    });
  }

  private async collapseRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.nodeStores.collapse(node);
      const children = node.children;
      if (!children) {
        return;
      }
      node.children = undefined;
      if (
        recursive ||
        this.config.get('autoCollapseOptions').includes('recursive')
      ) {
        for (const child of children) {
          await this.collapseRecursive(child, recursive);
        }
      }
    }
  }

  /**
   * collapse node
   */
  async collapse(node: TreeNode, { recursive = false } = {}) {
    await this.collapseRecursive(node, recursive);
    await this.collapseRender(node);
  }

  async renderNodes(
    nodes: SourceOptions.RenderNodes<TreeNode>,
  ): Promise<unknown> {
    return await this.sync(async (r) => {
      await (await r.renderNodesNotifier(nodes)).run();
    });
  }

  async renderPaths(paths: SourceOptions.RenderPaths) {
    await this.sync(async (r) => {
      await (await r.renderPathsNotifier(paths)).run();
    });
  }

  async render(options?: SourceOptions.Render<TreeNode>) {
    await this.sync(async (r) => {
      await (await r.renderNotifier(options))?.run();
    });
  }
}
