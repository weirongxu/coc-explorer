import { Notifier } from 'coc-helper';
import { workspace } from 'coc.nvim';
import { clone } from 'lodash-es';
import { Explorer } from '../explorer';
import { HighlightPositionWithLine } from '../highlight/types';
import { drawnWithIndexRange } from '../painter/util';
import {
  BaseTreeNode,
  ExplorerSource,
  NodeUid,
  SourceOptions,
} from '../source/source';
import { compactI, flatten } from '../util';

export class ViewSource<TreeNode extends BaseTreeNode<TreeNode>> {
  readonly explorer: Explorer;
  /**
   * rendered nodes
   */
  flattenedNodes: TreeNode[] = [];
  startLineIndex: number = 0;
  endLineIndex: number = 0;
  private requestedRenderNodes: Set<
    SourceOptions.RenderNode<TreeNode>
  > = new Set();

  get isHelpUI() {
    return this.explorer.view.isHelpUI;
  }

  get renderMutex() {
    return this.explorer.view.renderMutex;
  }

  get config() {
    return this.source.config;
  }

  private readonly nodeStores = (() => {
    type CompactStore =
      | undefined
      | { status: 'compact' }
      | { status: 'compacted'; nodes: TreeNode[] }
      | { status: 'uncompact'; nodes: TreeNode[] }
      | { status: 'uncompacted' };

    type NodeStore = {
      expanded: boolean;
      compact?: CompactStore;
    };

    const inner = {
      records: new Map<NodeUid, NodeStore>(),
      store(node: TreeNode): NodeStore {
        if (!inner.records.has(node.uid)) {
          inner.records.set(node.uid, {
            expanded: false,
          });
        }
        return inner.records.get(node.uid)!;
      },
      get<K extends keyof NodeStore>(node: TreeNode, key: K): NodeStore[K] {
        return inner.store(node)[key];
      },
      set<K extends keyof NodeStore>(
        node: TreeNode,
        key: K,
        value: NodeStore[K],
      ) {
        inner.store(node)[key] = value;
      },
    };

    const handles = {
      setExpanded(node: TreeNode, expanded: boolean) {
        expanded ? handles.expand(node) : handles.collapse(node);
      },
      expand(node: TreeNode) {
        inner.set(node, 'expanded', true);
      },
      collapse(node: TreeNode) {
        inner.set(node, 'expanded', false);
      },
      isExpanded(node: TreeNode) {
        return inner.get(node, 'expanded');
      },
      setCompact(node: TreeNode, compact: CompactStore) {
        if (
          compact?.status === 'compacted' ||
          compact?.status === 'uncompact'
        ) {
          node.compacted = true;
        } else {
          node.compacted = false;
        }
        inner.set(node, 'compact', compact);
      },
      getCompact(node: TreeNode): CompactStore {
        return inner.get(node, 'compact');
      },
    };
    return handles;
  })();

  rootExpandedForOpen = false;

  constructor(
    public readonly source: ExplorerSource<any>,
    public readonly rootNode: TreeNode,
  ) {
    this.explorer = this.source.explorer;
  }

  bootInit(rootExpandedForOpen: boolean) {
    this.rootExpandedForOpen = rootExpandedForOpen;
  }

  bootOpen() {
    this.nodeStores.setExpanded(this.rootNode, this.rootExpandedForOpen);
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
    const indexOf = this.explorer.sources.indexOf(
      this.source as ExplorerSource<any>,
    );
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

  /**
   * get all parents
   */
  flattenParents(node: TreeNode): TreeNode[] {
    let currentNode = node;
    const result: TreeNode[] = [];

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
  flattenNodeAndChildren(node: TreeNode): TreeNode[] {
    return [node, ...this.flattenChildren(node)];
  }

  /**
   * get all flattened children
   */
  flattenChildren(node: TreeNode): TreeNode[] {
    const result: TreeNode[] = [];
    const stack = node.children ? [...node.children] : [];

    function replaceNodeInSibling<TreeNode extends BaseTreeNode<TreeNode>>(
      oldNode: TreeNode,
      newNode: TreeNode,
    ) {
      if (oldNode.parent?.children) {
        const index = oldNode.parent.children.indexOf(oldNode);
        if (index !== -1) {
          oldNode.parent.children.splice(index, 1, newNode);
        }
      }
    }

    while (stack.length) {
      let node: TreeNode = stack.shift()!;
      if (!node.isRoot) {
        const compactStore = this.nodeStores.getCompact(node);
        if (
          (compactStore?.status === 'compact' ||
            (compactStore?.status === 'compacted' && !node.compacted)) &&
          node.children?.length === 1 &&
          node.children[0].expandable
        ) {
          // Compact node
          let tail = node.children[0];
          this.nodeStores.setCompact(node, undefined);
          const compactedNodes = [node, tail];
          while (tail.children?.length === 1 && tail.children[0].expandable) {
            this.nodeStores.setCompact(tail, undefined);
            tail = tail.children[0];
            compactedNodes.push(tail);
          }
          const compactedNode = clone(tail);
          compactedNode.uid = node.uid;
          compactedNode.level = node.level;
          compactedNode.parent = node.parent;
          this.nodeStores.setCompact(compactedNode, {
            status: 'compacted',
            nodes: compactedNodes,
          });
          replaceNodeInSibling(node, compactedNode);
          node = compactedNode;
        } else if (node.compacted && compactStore?.status === 'uncompact') {
          // Reset compact
          const compactedNode = node;
          this.nodeStores.setCompact(compactedNode, { status: 'uncompacted' });
          const nodes = compactStore.nodes;
          let cur = nodes.shift()!;
          cur.level = compactedNode.level;
          cur.parent = compactedNode.parent;
          replaceNodeInSibling(compactedNode, cur);
          while (nodes.length) {
            const child = nodes.shift()!;
            result.push(cur);
            cur.children = [child];
            child.parent = cur;
            child.level = cur.level! + 1;
            cur = child;
          }
          node = cur;
          node.children = compactedNode.children;
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

  private nodeAndChildrenRange(
    node: TreeNode,
  ): { startIndex: number; endIndex: number } | undefined {
    const startIndex = this.flattenedNodes.findIndex(
      (it) => it.uid === node.uid,
    );
    if (startIndex === -1) {
      return;
    }
    const parentLevel = node.level ?? 0;
    let endIndex = this.flattenedNodes.length - 1;
    for (
      let i = startIndex + 1, len = this.flattenedNodes.length;
      i < len;
      i++
    ) {
      if ((this.flattenedNodes[i].level ?? 0) <= parentLevel) {
        endIndex = i - 1;
        break;
      }
    }
    return { startIndex, endIndex };
  }

  isExpanded(node: TreeNode) {
    return this.nodeStores.isExpanded(node);
  }

  getCompact(node: TreeNode) {
    return this.nodeStores.getCompact(node);
  }

  // render
  private async expandRender(node: TreeNode) {
    if (this.isHelpUI) {
      return;
    }
    if (!this.isExpanded(node) || !node.children) {
      return;
    }
    const range = this.nodeAndChildrenRange(node);
    if (!range) {
      return;
    }
    const { startIndex, endIndex } = range;
    const needDrawNodes = this.flattenNodeAndChildren(node);

    await this.source.sourcePainters.beforeDraw(needDrawNodes, {
      draw: async () => {
        this.flattenedNodes = this.flattenedNodes
          .slice(0, startIndex)
          .concat(needDrawNodes)
          .concat(this.flattenedNodes.slice(endIndex + 1));
        this.source.locator.mark.offsetAfterLine(
          needDrawNodes.length - 1 - (endIndex - startIndex),
          startIndex,
        );
        const { contents, highlightPositions } = await this.drawNodes(
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
      drawAll: () => this.render(),
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
      const compactStore = this.nodeStores.getCompact(node);

      // uncompact
      if (
        node.compacted &&
        compactStore?.status === 'compacted' &&
        this.isExpanded(node)
      ) {
        if (uncompact) {
          this.nodeStores.setCompact(node, {
            status: 'uncompact',
            nodes: compactStore.nodes,
          });
        }
      }

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

      // compact
      if (
        !node.compacted &&
        (compactStore === undefined || compactStore.status === 'uncompacted')
      ) {
        if (compact && singleExpandableNode) {
          this.nodeStores.setCompact(node, {
            status: 'compact',
          });
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
    const range = this.nodeAndChildrenRange(node);
    if (!range) {
      return;
    }

    await this.source.sourcePainters.beforeDraw([node], {
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
        const { contents, highlightPositions } = await this.drawNodes([node]);
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
      drawAll: () => this.render(),
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

  async collapse(node: TreeNode, { recursive = false } = {}) {
    await this.collapseRecursive(node, recursive);
    await this.collapseRender(node);
  }

  private async drawNodes(nodes: TreeNode[]) {
    const drawnList = compactI(
      await Promise.all(
        nodes.map(async (node) => {
          const nodeIndex = this.flattenedNodes.findIndex(
            (it) => it.uid === node.uid,
          );
          if (nodeIndex < 0) {
            return;
          }
          return this.source.sourcePainters.drawNode(node, nodeIndex);
        }),
      ),
    );

    const startLineIndex = this.startLineIndex;

    return {
      drawnList,
      get contents() {
        return drawnList.map((d) => d.content);
      },
      get highlightPositions(): HighlightPositionWithLine[] {
        return flatten(
          drawnList.map((d) =>
            d.highlightPositions.map((hl) => ({
              lineIndex: startLineIndex + d.nodeIndex,
              ...hl,
            })),
          ),
        );
      },
    };
  }

  /**
   * request render nodes, it will render the node when finished the action
   */
  requestRenderNodes(nodes: SourceOptions.RenderNodes<TreeNode>) {
    for (const node of nodes) {
      this.requestedRenderNodes.add(node);
    }
  }

  async emitRequestRenderNodesNotifier() {
    if (this.requestedRenderNodes.size <= 0) {
      return;
    }
    const nodes = Array.from(this.requestedRenderNodes);
    this.requestedRenderNodes.clear();
    return this.renderNodesNotifier(nodes);
  }

  async renderNodes(nodes: SourceOptions.RenderNodes<TreeNode>) {
    return (await this.renderNodesNotifier(nodes)).run();
  }

  async renderNodesNotifier(nodes: SourceOptions.RenderNodes<TreeNode>) {
    type NodeItem = {
      nodes: TreeNode[];
      withParents: boolean;
      withChildren: boolean;
    };

    const nodeArr = nodes instanceof Set ? Array.from(nodes) : nodes;
    const nodeItems: NodeItem[] = nodeArr.map((o) => {
      if ('uid' in o) {
        return {
          nodes: [o],
          withParents: false,
          withChildren: false,
        };
      } else {
        return {
          nodes: [...o.nodes],
          withParents: o.withParents ?? false,
          withChildren: o.withChildren ?? false,
        };
      }
    });

    const finalNodes: TreeNode[] = [];

    for (const node of nodeItems) {
      finalNodes.push(...node.nodes);
      if (node.withParents) {
        for (const n of node.nodes) {
          finalNodes.push(...this.flattenParents(n));
        }
      }
      if (node.withChildren) {
        for (const n of node.nodes) {
          finalNodes.push(...this.flattenNodeAndChildren(n));
        }
      }
    }

    return await this.source.sourcePainters.beforeDraw(finalNodes, {
      draw: async () => {
        const { drawnList, highlightPositions } = await this.drawNodes(
          finalNodes,
        );
        const drawnRangeList = drawnWithIndexRange(drawnList);
        await this.source.events.fire('drawn');
        return Notifier.create(() => {
          drawnRangeList.forEach((dr) => {
            this.setLinesNotifier(
              dr.drawnList.map((d) => d.content),
              dr.nodeIndexStart,
              dr.nodeIndexEnd + 1,
            ).notify();
          });
          this.source.highlight.addHighlightsNotify(highlightPositions);
          if (workspace.isVim) {
            workspace.nvim.command('redraw', true);
          }
        });
      },
      drawAll: () => this.renderNotifier(),
      abort: () => Notifier.noop(),
    });
  }

  async renderPaths(paths: SourceOptions.RenderPaths) {
    return (await this.renderPathsNotifier(paths)).run();
  }

  async renderPathsNotifier(paths: SourceOptions.RenderPaths) {
    if (this.isHelpUI) {
      return Notifier.noop();
    }
    const pathArr = paths instanceof Set ? Array.from(paths) : paths;
    if (!pathArr.length) {
      return Notifier.noop();
    }
    const getNodes = (paths: string[]) =>
      this.flattenedNodes.filter(
        (n) => n.fullpath && paths.includes(n.fullpath),
      );
    const renderNodes: SourceOptions.RenderNode<TreeNode>[] = pathArr.map(
      (o) => {
        if (typeof o === 'string') {
          return {
            nodes: getNodes([o]),
          };
        } else {
          return {
            nodes: getNodes([...o.paths]),
            withParents: o.withParents,
            withChildren: o.withChildren,
          };
        }
      },
    );
    return this.renderNodesNotifier(renderNodes);
  }

  async render(options?: SourceOptions.Render<TreeNode>) {
    return (await this.renderNotifier(options))?.run();
  }

  async renderNotifier({
    node = this.rootNode,
    force = false,
  }: SourceOptions.Render<TreeNode> = {}) {
    if (this.isHelpUI) {
      return Notifier.noop();
    }

    const range = this.nodeAndChildrenRange(node);
    if (!range && !node.isRoot) {
      return Notifier.noop();
    }

    const { startIndex: nodeIndex, endIndex } = range
      ? range
      : { startIndex: 0, endIndex: this.flattenedNodes.length - 1 };
    const oldHeight = endIndex - nodeIndex + 1;
    const needDrawNodes = this.flattenNodeAndChildren(node);
    const newHeight = needDrawNodes.length;
    this.flattenedNodes = this.flattenedNodes
      .slice(0, nodeIndex)
      .concat(needDrawNodes)
      .concat(this.flattenedNodes.slice(endIndex + 1));

    if (newHeight < oldHeight) {
      this.explorer.locator.mark.removeLines(
        this.startLineIndex + newHeight + 1,
        this.startLineIndex + oldHeight + 1,
      );
    }
    this.source.locator.mark.offsetAfterLine(
      newHeight - oldHeight,
      this.endLineIndex,
    );
    await this.source.sourcePainters.beforeDraw(needDrawNodes, { force });
    const { contents, highlightPositions } = await this.drawNodes(
      needDrawNodes,
    );
    await this.source.events.fire('drawn');

    const sourceIndex = this.currentSourceIndex();
    const isLastSource = this.explorer.sources.length - 1 === sourceIndex;

    return Notifier.create(() => {
      this.explorer
        .setLinesNotifier(
          contents,
          this.startLineIndex + nodeIndex,
          isLastSource && node.isRoot
            ? -1
            : this.startLineIndex + nodeIndex + oldHeight,
        )
        .notify();
      this.source.highlight.addHighlightsNotify(highlightPositions);

      if (workspace.isVim) {
        workspace.nvim.command('redraw', true);
      }
    });
  }
}
