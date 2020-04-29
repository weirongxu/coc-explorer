import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'modified', () => ({
  draw(row, node) {
    const ch = node.modified ? '+' : node.modifiable ? '' : '-';
    if (ch) {
      row.add(ch, { hl: bufferHighlights.modified });
    }
  },
}));
