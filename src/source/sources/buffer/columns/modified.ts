import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('modified', () => ({
  draw(row, node) {
    row.add(node.modified ? '+' : node.modifiable ? '' : '-', { hl: bufferHighlights.modified });
  },
}));
