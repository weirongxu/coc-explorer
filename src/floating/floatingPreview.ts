import { Explorer } from '../explorer';
import { DrawLabelingResult } from '../source/templateRenderer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import {
  Cancellable,
  debouncePromise,
  PreviewStrategy,
  getPreviewStrategy,
  supportedFloat,
  Cancelled,
} from '../util';
import { workspace, FloatBuffer } from 'coc.nvim';
import { FloatingFactory2 } from './floatingFactory2';
import { FloatingFactory3 } from './floatingFactory3';

export class FloatingPreview {
  nvim = workspace.nvim;
  floatFactory: FloatingFactory2 | FloatingFactory3;
  shown: boolean = false;

  constructor(public explorer: Explorer) {
    this.floatFactory = new ('getDimension' in FloatBuffer
      ? FloatingFactory3
      : FloatingFactory2)(this.explorer, this.nvim, workspace.env, false);
  }

  async previewNode(
    previewStrategy: PreviewStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
  ) {
    if (!supportedFloat()) {
      return;
    }

    let drawLabelingResult: DrawLabelingResult | undefined;
    if (node.isRoot) {
      drawLabelingResult = await source.drawRootLabeling(node);
    } else {
      drawLabelingResult = await source.templateRenderer?.drawLabeling(
        node,
        nodeIndex,
      );
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
        line: hl.line,
        colStart: hl.start,
        colEnd: hl.start + hl.size,
      })),
    );
  }

  _hoverPreview?: Cancellable<() => Promise<void | Cancelled>>;
  async hoverPreview() {
    if (!supportedFloat()) {
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
        const nodeIndex = source.currentLineIndex;
        if (nodeIndex === null) {
          return;
        }
        const node = source.flattenedNodes[nodeIndex];
        if (!node) {
          return;
        }
        await this.previewNode(getPreviewStrategy(), source, node, nodeIndex);
      });
    }
    return this._hoverPreview();
  }

  hoverPreviewCancel() {
    if (!supportedFloat()) {
      return;
    }

    this._hoverPreview?.cancel();
  }
}
