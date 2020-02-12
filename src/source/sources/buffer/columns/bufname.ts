import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('bufname', () => ({
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.bufname, { hl: bufferHighlights.bufname });
    }
  },
}));
