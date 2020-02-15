import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('child', 'fullpath', () => ({
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.fullpath, { hl: bufferHighlights.fullpath });
    }
  },
}));
