import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { max } from '../../../../util';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn<{
  maxBufnrWidth: number;
}>('child', 'bufnr', ({ column }) => ({
  data: {
    maxBufnrWidth: 0,
  },
  beforeDraw(nodes) {
    const maxBufnrWidth = max(nodes.map((node) => node.bufnrStr.length));
    if (!maxBufnrWidth) {
      return;
    }
    if (column.data.maxBufnrWidth !== maxBufnrWidth) {
      column.data.maxBufnrWidth = maxBufnrWidth;
      return true;
    }
  },
  draw(row, node) {
    row.add(node.bufnrStr.padStart(column.data.maxBufnrWidth), {
      hl: bufferHighlights.bufnr,
    });
  },
}));
