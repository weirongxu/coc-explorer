import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'readonly', ({ source }) => ({
  draw() {
    return {
      labelOnly: true,
      labelVisible: ({ node }) => node.readonly,
      drawNode(row, { node }) {
        if (node.readonly) {
          row.add(node.readonly ? source.icons.readonly : '', {
            hl: bufferHighlights.readonly,
          });
        }
      },
    };
  },
}));
