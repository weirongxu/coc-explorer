import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('name', () => ({
  draw(row, node) {
    if (node.visible) {
      row.add(node.basename, bufferHighlights.nameVisible);
    } else {
      row.add(node.basename);
    }
    row.add(' ');
  },
}));
