import { Explorer } from '../explorer';
import { DrawLabelingResult } from '../source/column-manager';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { Cancellable, debouncePromise, PreviewStrategy, previewStrategy } from '../util';
import { workspace } from 'coc.nvim';
import { FloatingFactory2 } from './floating-factory2';
import { floatSupported } from './utils';

export class FloatingPreview {
  nvim = workspace.nvim;
  floatFactory = new FloatingFactory2(this.nvim, workspace.env, false);
  shown: boolean = false;

  constructor(public explorer: Explorer) {}

  async previewNode(
    previewStrategy: PreviewStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
  ) {
    if (!floatSupported()) {
      return;
    }

    let drawLabelingResult: DrawLabelingResult | undefined;
    if (node.isRoot) {
      drawLabelingResult = await source.drawRootLabeling(node);
    } else {
      drawLabelingResult = await source.columnManager.drawLabeling(node, nodeIndex);
    }
    if (!drawLabelingResult || !this.explorer.explorerManager.inExplorer()) {
      return;
    }

    await this.floatFactory.create(
      this.explorer,
      [
        {
          content: drawLabelingResult.lines.join('\n'),
          filetype: 'coc-explorer-preview',
        },
      ],
      drawLabelingResult.highlightPositions.map((hl) => ({
        hlGroup: hl.group,
        line: hl.relativeLineIndex,
        colStart: hl.start,
        colEnd: hl.start + hl.size,
      })),
    );
  }

  _hoverPreview?: Cancellable<() => Promise<void>>;
  async hoverPreview() {
    if (!floatSupported()) {
      return;
    }

    if (!this._hoverPreview) {
      this._hoverPreview = debouncePromise(200, async () => {
        if (!this.explorer.explorerManager.inExplorer()) {
          return;
        }
        const source = await this.explorer.currentSource();
        if (!source) {
          return;
        }
        const nodeIndex = await source.currentLineIndex();
        if (nodeIndex !== null) {
          const node = source.flattenedNodes[nodeIndex];
          await this.previewNode(previewStrategy, source, node, nodeIndex);
        }
      });
    }
    return this._hoverPreview();
  }

  hoverPreviewCancel() {
    if (!floatSupported()) {
      return;
    }

    this._hoverPreview?.cancel();
  }
}
