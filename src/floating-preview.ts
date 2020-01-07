import { Explorer } from './explorer';
import { workspace, FloatFactory, Documentation } from 'coc.nvim';
import { WindowConfig } from 'coc.nvim/lib/model/floatFactory';
import { execNotifyBlock, debouncePromise, Cancellable } from './util';
import { DrawMultiLineResult } from './source/column-manager';
import { BaseTreeNode, ExplorerSource } from './source/source';

export class FloatingPreview {
  nvim = workspace.nvim;
  floatFactory = new FloatFactory(this.nvim, workspace.env, false);
  constructor(public explorer: Explorer) {
    const self = this;
    const oldGetBoundings = this.floatFactory.getBoundings;
    this.floatFactory.getBoundings = async function(
      docs: Documentation[],
      offsetX = 0,
    ): Promise<WindowConfig> {
      const winConfig = await oldGetBoundings.call(this, docs, offsetX);
      const col = await self.explorer.currentCol();
      const win = await self.explorer.win;
      const width = await win?.width;
      if (width) {
        if (self.explorer.args.position === 'left') {
          winConfig.col = width - col + 1;
        } else if (self.explorer.args.position === 'right') {
          winConfig.col = -winConfig.width - col + 1;
        }
        winConfig.row = winConfig.row > 0 ? 0 : winConfig.row + 1;
      }
      return winConfig;
    };
  }

  async renderNode(source: ExplorerSource<any>, node: BaseTreeNode<any>, nodeIndex: number) {
    let drawMultiLineResult: DrawMultiLineResult | undefined;
    if (node.isRoot) {
      drawMultiLineResult = await source.drawRootMultiLine(node);
    } else {
      drawMultiLineResult = await source.columnManager.drawMultiLine(node, nodeIndex);
    }
    if (!drawMultiLineResult || !this.explorer.explorerManager.inExplorer()) {
      return;
    }
    await this.floatFactory.create(
      [
        {
          content: drawMultiLineResult.lines.join('\n'),
          filetype: 'coc-explorer-preview',
        },
      ],
      false,
    );
    await execNotifyBlock(async () => {
      for (const hl of drawMultiLineResult!.highlightPositions) {
        await this.floatFactory.buffer.addHighlight({
          hlGroup: hl.group,
          line: hl.relativeLineIndex,
          colStart: hl.start,
          colEnd: hl.start + hl.size,
        });
      }
    });
  }

  _hoverRender?: Cancellable<() => Promise<void>>;
  async hoverRender() {
    if (!this._hoverRender) {
      this._hoverRender = debouncePromise(200, async () => {
        if (!this.explorer.explorerManager.inExplorer()) {
          return;
        }
        const source = await this.explorer.currentSource();
        const nodeIndex = await source.currentLineIndex();
        if (nodeIndex !== null) {
          const node = source.flattenedNodes[nodeIndex];
          await this.renderNode(source, node, nodeIndex);
        }
      });
    }
    return this._hoverRender();
  }

  hoverRenderCancel() {
    this._hoverRender?.cancel();
  }
}
