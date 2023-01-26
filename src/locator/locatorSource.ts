import { Notifier } from 'coc-helper';
import type { Explorer } from '../explorer';
import type { BaseTreeNode, ExplorerSource, NodeUid } from '../source/source';
import { MarkSource } from './markSource';

export class LocatorSource<TreeNode extends BaseTreeNode<TreeNode>> {
  readonly explorer: Explorer;
  mark: MarkSource<TreeNode>;

  get view() {
    return this.source.view;
  }

  constructor(public readonly source: ExplorerSource<TreeNode>) {
    this.explorer = this.source.explorer;
    this.mark = new MarkSource(source);
  }

  async gotoLineIndex(lineIndex: number, col?: number) {
    return (await this.gotoLineIndexNotifier(lineIndex, col)).run();
  }

  gotoLineIndexNotifier(lineIndex: number, col?: number) {
    if (lineIndex < 0) {
      lineIndex = 0;
    }
    if (lineIndex >= this.source.height) {
      lineIndex = this.source.height - 1;
    }
    return this.explorer.locator.gotoLineIndexNotifier(
      this.view.startLineIndex + lineIndex,
      col,
    );
  }

  async gotoRoot({ col }: { col?: number } = {}) {
    return (await this.gotoLineIndexNotifier(0, col)).run();
  }

  gotoRootNotifier({ col }: { col?: number } = {}) {
    return this.gotoLineIndexNotifier(0, col);
  }

  async gotoNode(
    node: TreeNode,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return (await this.gotoNodeNotifier(node, options)).run();
  }

  async gotoNodeNotifier(
    node: TreeNode,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return this.gotoNodeUidNotifier(node.uid, options);
  }

  async gotoNodeUid(
    nodeUid: NodeUid,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return (await this.gotoNodeUidNotifier(nodeUid, options)).run();
  }

  async gotoNodeUidNotifier(
    nodeUid: NodeUid,
    {
      lineIndex: fallbackLineIndex,
      col = 0,
    }: { lineIndex?: number; col?: number } = {},
  ) {
    const lineIndex = this.view.flattenedNodes.findIndex(
      (it) => it.uid === nodeUid,
    );
    if (lineIndex !== -1) {
      return this.gotoLineIndexNotifier(lineIndex, col);
    } else if (fallbackLineIndex !== undefined) {
      return this.gotoLineIndexNotifier(fallbackLineIndex, col);
    } else {
      return Notifier.noop();
    }
  }
}
