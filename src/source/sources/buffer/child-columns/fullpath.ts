import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'fullpath', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.basename !== node.bufname) {
          row.add(node.fullpath, { hl: bufferHighlights.fullpath });
        }
      },
    };
  },
}));
