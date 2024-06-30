import type { Explorer } from '../explorer';
import type { BaseTreeNode, ExplorerSource } from '../source/source';

export class MarkSource<TreeNode extends BaseTreeNode<TreeNode>> {
  explorer: Explorer;

  get view() {
    return this.source.view;
  }

  constructor(public readonly source: ExplorerSource<TreeNode>) {
    this.explorer = source.explorer;
  }

  add(type: string, relativeLineIndex: number) {
    this.explorer.locator.mark.add(
      type,
      this.view.startLineIndex + relativeLineIndex,
    );
  }

  remove(type: string, relativeLineIndex: number) {
    this.explorer.locator.mark.remove(
      type,
      this.view.startLineIndex + relativeLineIndex,
    );
  }

  offsetAfterLine(offset: number, afterLine: number) {
    this.explorer.locator.mark.offsetLines(
      offset,
      this.view.startLineIndex + afterLine + 1,
    );
    this.view.endLineIndex += offset;
    const sourceIndex = this.view.currentSourceIndex();
    if (sourceIndex === undefined) {
      return;
    }
    this.explorer.sources.slice(sourceIndex + 1).forEach(({ view }) => {
      view.startLineIndex += offset;
      view.endLineIndex += offset;
    });
  }
}
