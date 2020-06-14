import { FloatBuffer, workspace, Disposable } from 'coc.nvim';
import { Explorer } from '../explorer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { Drawn, flatten, supportedFloat } from '../util';
import { FloatingFactory2 } from './floatingFactory2';
import { FloatingFactory3 } from './floatingFactory3';
import { PreviewStrategy } from '../types';

export class FloatingPreview implements Disposable {
  nvim = workspace.nvim;
  floatFactory: FloatingFactory2 | FloatingFactory3;
  shown: boolean = false;

  constructor(public explorer: Explorer) {
    this.floatFactory = new ('getDimension' in FloatBuffer
      ? FloatingFactory3
      : FloatingFactory2)(this.explorer, this.nvim, workspace.env, false);
  }

  dispose() {
    this.floatFactory.dispose();
  }

  private _previewNodeTimeout?: NodeJS.Timeout;

  private async _previewNode(
    previewStrategy: PreviewStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
  ) {
    if (previewStrategy === 'labeling') {
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
  }

  async previewNode(
    previewStrategy: PreviewStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
    debounceTimeout: number = 0,
  ) {
    if (!supportedFloat()) {
      return;
    }

    if (this._previewNodeTimeout) {
      clearTimeout(this._previewNodeTimeout);
    }

    if (debounceTimeout) {
      this._previewNodeTimeout = setTimeout(async () => {
        await this._previewNode(previewStrategy, source, node, nodeIndex);
      }, debounceTimeout);
    } else {
      await this._previewNode(previewStrategy, source, node, nodeIndex);
    }
  }
}
