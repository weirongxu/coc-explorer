import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('modified', () => ({
  draw(row, node) {
    const ch = node.modified ? '+' : node.modifiable ? '' : '-';
    if (ch) {
      row.add(ch, { hl: bufferHighlights.modified });
    }
  },
}));
