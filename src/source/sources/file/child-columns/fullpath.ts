import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'fullpath', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.directory) {
          row.add(node.fullpath + '/', { hl: fileHighlights.directory });
        } else {
          row.add(node.fullpath);
        }
      },
    };
  },
}));
