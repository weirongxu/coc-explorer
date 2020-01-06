import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { max } from '../../../../util';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn(
  'bufnr',
  (_source, data) => ({
    beforeDraw(nodes) {
      const maxBufnrWidth = max(nodes.map((node) => node.bufnrStr.length));
      if (data.maxBufnrWidth !== maxBufnrWidth) {
        data.maxBufnrWidth = maxBufnrWidth;
        return true;
      }
    },
    draw(row, node) {
      row.add(node.bufnrStr.padStart(data.maxBufnrWidth), bufferHighlights.bufnr);
      row.add(' ');
    },
  }),
  () => ({
    maxBufnrWidth: 0,
  }),
);
