import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'bufname', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(node.bufname, { hl: bufferHighlights.bufname });
      },
    };
  },
}));
