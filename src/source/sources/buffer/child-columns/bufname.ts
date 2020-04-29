import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'bufname', () => ({
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.bufname, { hl: bufferHighlights.bufname });
    }
  },
}));
