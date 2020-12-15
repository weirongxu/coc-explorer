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
import { flatten } from '../util';

export class ViewSource<TreeNode extends BaseTreeNode<TreeNode>> {
  readonly explorer: Explorer;
  flattenedNodes: TreeNode[] = [];
  startLineIndex: number = 0;
  endLineIndex: number = 0;
  private requestedRenderNodes: Set<TreeNode> = new Set();

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

  rootExpanded = false;

  constructor(
    public readonly source: ExplorerSource<any>,
    public readonly rootNode: TreeNode,
  ) {
    this.explorer = this.source.explorer;
  }

  bootInit(rootExpanded: boolean) {
    this.rootExpanded = rootExpanded;
    this.nodeStores.setExpanded(this.rootNode, rootExpanded);
  }

  bootOpen() {
    this.nodeStores.setExpanded(this.rootNode, this.rootExpanded);
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

  flattenByNode(node: TreeNode): TreeNode[] {
    const stack = [node];
    const result: TreeNode[] = [];

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
      if (node.children && this.isExpanded(node)) {
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
    const needDrawNodes = this.flattenByNode(node);

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
      if (!node.children || (options.load ?? true)) {
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
    if (this.isHelpUI) {
      return;
    }
    if (this.isExpanded(node)) {
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
      if (
        recursive ||
        this.config.get('autoCollapseOptions').includes('recursive')
      ) {
        if (node.children) {
          for (const child of node.children) {
            await this.collapseRecursive(child, recursive);
          }
        }
      }
    }
  }

  async collapse(node: TreeNode, { recursive = false } = {}) {
    await this.collapseRecursive(node, recursive);
    await this.collapseRender(node);
  }

  private async drawNodes(nodes: TreeNode[]) {
    const drawnList = await Promise.all(
      nodes.map(async (node) => {
        const nodeIndex = this.flattenedNodes.findIndex(
          (it) => it.uid === node.uid,
        );
        if (nodeIndex < 0) {
          throw new Error(`node(${node.uid}) not found`);
        }
        return this.source.sourcePainters.drawNode(node, nodeIndex);
      }),
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
    return await this.source.sourcePainters.beforeDraw(nodes, {
      draw: async () => {
        const { drawnList, highlightPositions } = await this.drawNodes(nodes);
        const drawnRangeList = drawnWithIndexRange(drawnList);
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
    type PathItem = {
      paths: string[];
      withParent: boolean;
      withChildren: boolean;
    };
    const pathArr = paths instanceof Set ? Array.from(paths) : paths;
    const pathItems: PathItem[] = pathArr.map((o) => {
      if (typeof o === 'string') {
        return {
          paths: [o],
          withParent: false,
          withChildren: false,
        };
      } else if (typeof o.path === 'string') {
        return {
          paths: [o.path],
          withParent: o.withParent ?? false,
          withChildren: o.withChildren ?? false,
        };
      } else {
        return {
          paths: Array.from(o.path),
          withParent: o.withParent ?? false,
          withChildren: o.withChildren ?? false,
        };
      }
    });
    if (!pathArr.length) {
      return Notifier.noop();
    }
    const filterFn: (
      path: string,
      withParent: boolean,
      withChildren: boolean,
      node: TreeNode & { fullpath: string },
    ) => boolean = (path, withParent, withChildren, node) => {
      return (
        path === node.fullpath ||
        (withParent && path.startsWith(node.fullpath)) ||
        (withChildren && node.fullpath.startsWith(path))
      );
    };
    const nodes = this.flattenedNodes.filter(
      (n) =>
        n.fullpath &&
        pathItems.some((item) =>
          item.paths.some((path) =>
            filterFn(
              path,
              item.withParent,
              item.withChildren,
              n as TreeNode & { fullpath: string },
            ),
          ),
        ),
    );
    return this.renderNodesNotifier(nodes);
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
    const needDrawNodes = this.flattenByNode(node);
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
