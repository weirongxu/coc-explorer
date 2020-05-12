import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'filename', ({ source }) => ({
  draw() {
    return {
      async drawNode(row, { node }) {
        if (node.directory) {
          const compactStore = source.getCompact(node);
          if (compactStore?.status === 'compacted') {
            row.add(compactStore.nodes.map((n) => n.name).join('/'), {
              hl: fileHighlights.directory,
              unicode: true,
            });
          } else {
            row.add(node.name, {
              hl: fileHighlights.directory,
              unicode: true,
            });
          }
        } else {
          row.add(node.name, { unicode: true });
        }
      },
    };
  },
}));
