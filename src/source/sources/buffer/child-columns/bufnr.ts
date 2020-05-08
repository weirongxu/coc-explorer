import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { max } from '../../../../util';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'bufnr', () => {
  let prevMaxBufnrWidth = 0;
  return {
    draw(nodes, { drawAll, abort }) {
      const maxBufnrWidth = max(nodes.map((node) => node.bufnrStr.length));
      if (!maxBufnrWidth) {
        return abort();
      }
      if (prevMaxBufnrWidth !== maxBufnrWidth) {
        prevMaxBufnrWidth = maxBufnrWidth;
        drawAll();
      }
      return {
        drawNode(row, { node }) {
          row.add(node.bufnrStr.padStart(prevMaxBufnrWidth), {
            hl: bufferHighlights.bufnr,
          });
        },
      };
    },
  };
});
