import { Explorer } from '../explorer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import {
  Cancellable,
  debouncePromise,
  PreviewStrategy,
  supportedFloat,
  Cancelled,
  flatten,
} from '../util';
import { workspace, FloatBuffer } from 'coc.nvim';
import { FloatingFactory2 } from './floatingFactory2';
import { FloatingFactory3 } from './floatingFactory3';
import { Drawn } from '../util/painter';

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

    const drawnList:
      | Drawn[]
      | undefined = await source.sourcePainters?.drawNodeLabeling(
      node,
      nodeIndex,
    );
    if (!drawnList || !this.explorer.explorerManager.inExplorer()) {
      return;
    }

    await this.floatFactory.create(
      this.explorer,
      [
        {
          content: drawnList.map((d) => d.content).join('\n'),
          filetype: 'coc-explorer-preview',
        },
      ],
      flatten(
        drawnList.map((d, index) =>
          d.highlightPositions.map((hl) => ({
            hlGroup: hl.group,
            line: index,
            colStart: hl.start,
            colEnd: hl.start + hl.size,
          })),
        ),
      ),
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
        await this.previewNode(
          this.explorer.config.previewStrategy,
          source,
          node,
          nodeIndex,
        );
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
