import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('child', 'name', () => ({
  draw(row, node) {
    if (node.visible) {
      row.add(node.basename, { hl: bufferHighlights.nameVisible });
    } else {
      row.add(node.basename);
    }
  },
}));
