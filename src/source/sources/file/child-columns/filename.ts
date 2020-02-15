import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('child', 'filename', () => ({
  async draw(row, node) {
    if (node.directory) {
      row.add(node.name, {
        hl: fileHighlights.directory,
        unicode: true,
      });
    } else {
      row.add(node.name, { unicode: true });
    }
  },
}));
