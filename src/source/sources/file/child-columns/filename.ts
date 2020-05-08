import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'filename', () => ({
  draw() {
    return {
      async drawNode(row, { node }) {
        if (node.directory) {
          row.add(node.name, {
            hl: fileHighlights.directory,
            unicode: true,
          });
        } else {
          row.add(node.name, { unicode: true });
        }
      },
    };
  },
}));
