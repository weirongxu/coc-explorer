import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'readonly', ({ source }) => ({
  draw() {
    return {
      labelOnly: true,
      labelVisible: ({ node }) => node.readonly,
      drawNode(row, { node }) {
        if (node.readonly) {
          row.add(source.icons.readonly, {
            hl: fileHighlights.readonly,
          });
        }
      },
    };
  },
}));
