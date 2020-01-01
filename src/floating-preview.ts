import { Explorer } from './explorer';
import { workspace, FloatFactory, Documentation } from 'coc.nvim';
import { WindowConfig } from 'coc.nvim/lib/model/floatFactory';
import { execNotifyBlock, debouncePromise } from './util';

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
      const win = await self.explorer.win;
      const width = await win?.width;
      if (width) {
        if (self.explorer.args.position === 'left') {
          winConfig.col = width;
        } else if (self.explorer.args.position === 'right') {
          winConfig.col = -winConfig.width;
        }
      }
      return winConfig;
    };
  }

  _render?: () => Promise<void>;
  async render() {
    if (!this._render) {
      this._render = debouncePromise(200, async () => {
        const source = await this.explorer.currentSource();
        const nodeIndex = await source.currentLineIndex();
        if (nodeIndex !== null) {
          const node = source.flattenedNodes[nodeIndex];
          const floatingDoc = await source.columnManager.drawMultiLine(node, nodeIndex);
          await this.floatFactory.create(
            [
              {
                content: floatingDoc.lines.join('\n'),
                filetype: 'coc-explorer-preview',
              },
            ],
            false,
          );
          await execNotifyBlock(async () => {
            for (const hl of floatingDoc.highlightPositions) {
              await this.floatFactory.buffer.addHighlight({
                hlGroup: hl.group,
                line: hl.relativeLineIndex,
                colStart: hl.start,
                colEnd: hl.start + hl.size,
              });
            }
          });
        }
      });
    }
    return this._render();
  }
}
