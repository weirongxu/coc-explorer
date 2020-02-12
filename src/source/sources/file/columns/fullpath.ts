import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('fullpath', () => ({
  draw(row, node) {
    if (node.directory) {
      row.add(node.fullpath + '/', { hl: fileHighlights.directory });
    } else {
      row.add(node.fullpath);
    }
  },
}));
