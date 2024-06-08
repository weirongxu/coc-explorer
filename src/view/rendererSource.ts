import { Notifier } from 'coc-helper';
import { workspace } from 'coc.nvim';
import type { Explorer } from '../explorer';
import type { HighlightPositionWithLine } from '../highlight/types';
import { drawnWithIndexRange } from '../painter/util';
import type {
  BaseTreeNode,
  ExplorerSource,
  SourceOptions,
} from '../source/source';
import { compactI } from '../util';
import type { ViewSource } from './viewSource';

export const rendererSourceSymbol = Symbol('rendererSource');

export class RendererSource<TreeNode extends BaseTreeNode<TreeNode>> {
  constructor(
    readonly view: ViewSource<TreeNode>,
    readonly explorer: Explorer = view.explorer,
    readonly source: ExplorerSource<TreeNode> = view.source,
  ) {}

  requestedRenderNodes: Set<SourceOptions.RenderNode<TreeNode>> = new Set();

  nodeAndChildrenRange(
    node: TreeNode,
  ): { startIndex: number; endIndex: number } | undefined {
    const startIndex = this.view.flattenedNodes.findIndex(
      (it) => it.uid === node.uid,
    );
    if (startIndex === -1) {
      return;
    }
    const parentLevel = node.level ?? 0;
    let endIndex = this.view.flattenedNodes.length - 1;
    for (
      let i = startIndex + 1, len = this.view.flattenedNodes.length;
      i < len;
      i++
    ) {
      if ((this.view.flattenedNodes[i]!.level ?? 0) <= parentLevel) {
        endIndex = i - 1;
        break;
      }
    }
    return { startIndex, endIndex };
  }

  async drawNodes(nodes: TreeNode[]) {
    const drawnList = compactI(
      await Promise.all(
        nodes.map(async (node) => {
          const nodeIndex = this.view.flattenedNodes.findIndex(
            (it) => it.uid === node.uid,
          );
          if (nodeIndex < 0) {
            return;
          }
          const finalNode = this.view.flattenedNodes.at(nodeIndex);
          if (!finalNode) {
            return;
          }
          return this.view.sourcePainters.drawNode(finalNode, nodeIndex);
        }),
      ),
    );

    const startLineIndex = this.view.startLineIndex;

    return {
      drawnList,
      get contents() {
        return drawnList.map((d) => d.content);
      },
      get highlightPositions(): HighlightPositionWithLine[] {
        return drawnList
          .map((d) =>
            d.highlightPositions.map((hl) => ({
              lineIndex: startLineIndex + d.nodeIndex,
              ...hl,
            })),
          )
          .flat();
      },
    };
  }

  async emitRequestRenderNodesNotifier() {
    if (this.requestedRenderNodes.size <= 0) {
      return;
    }
    const nodes = Array.from(this.requestedRenderNodes);
    this.requestedRenderNodes.clear();
    return this.renderNodesNotifier(nodes);
  }

  async renderPathsNotifier(paths: SourceOptions.RenderPaths) {
    if (this.view.isHelpUI) {
      return Notifier.noop();
    }
    const pathArr = paths instanceof Set ? Array.from(paths) : paths;
    if (!pathArr.length) {
      return Notifier.noop();
    }
    const getNodes = (paths: string[]) =>
      this.view.flattenedNodes.filter(
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
          finalNodes.push(...this.view.flattenParents(n));
        }
      }
      if (node.withChildren) {
        for (const n of node.nodes) {
          finalNodes.push(...this.view.flattenNode(n));
        }
      }
    }

    if (!finalNodes.length) {
      return Notifier.noop();
    }

    return await this.view.sourcePainters.drawPre(finalNodes, {
      draw: async () => {
        const { drawnList, highlightPositions } =
          await this.drawNodes(finalNodes);
        const drawnRangeList = drawnWithIndexRange(drawnList);
        await this.source.events.fire('drawn');
        return Notifier.create(() => {
          drawnRangeList.forEach((dr) => {
            this.view
              .setLinesNotifier(
                dr.drawnList.map((d) => d.content),
                dr.nodeIndexStart,
                dr.nodeIndexEnd + 1,
              )
              .notify();
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

  async renderNotifier({
    node = this.view.rootNode,
    force = false,
  }: SourceOptions.Render<TreeNode> = {}) {
    if (this.view.isHelpUI) {
      return Notifier.noop();
    }

    const range = this.nodeAndChildrenRange(node);
    if (!range && !node.isRoot) {
      return Notifier.noop();
    }

    const { startIndex: nodeIndex, endIndex } = range
      ? range
      : { startIndex: 0, endIndex: this.view.flattenedNodes.length - 1 };
    const oldHeight = endIndex - nodeIndex + 1;
    const needDrawNodes = this.view.flattenNode(node);
    const newHeight = needDrawNodes.length;
    this.view.flattenedNodes = this.view.flattenedNodes
      .slice(0, nodeIndex)
      .concat(needDrawNodes)
      .concat(this.view.flattenedNodes.slice(endIndex + 1));

    if (newHeight < oldHeight) {
      this.explorer.locator.mark.removeLines(
        this.view.startLineIndex + newHeight + 1,
        this.view.startLineIndex + oldHeight + 1,
      );
    }
    this.source.locator.mark.offsetAfterLine(
      newHeight - oldHeight,
      this.view.endLineIndex,
    );
    await this.view.sourcePainters.drawPre(needDrawNodes, { force });
    const { contents, highlightPositions } =
      await this.drawNodes(needDrawNodes);
    await this.source.events.fire('drawn');

    const sourceIndex = this.view.currentSourceIndex();
    const isLastSource = this.explorer.sources.length - 1 === sourceIndex;

    return Notifier.create(() => {
      this.explorer
        .setLinesNotifier(
          contents,
          this.view.startLineIndex + nodeIndex,
          isLastSource && node.isRoot
            ? -1
            : this.view.startLineIndex + nodeIndex + oldHeight,
        )
        .notify();
      this.source.highlight.addHighlightsNotify(highlightPositions);

      if (workspace.isVim) {
        workspace.nvim.command('redraw', true);
      }
    });
  }
}
