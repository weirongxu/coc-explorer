import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'readonly', ({ source }) => ({
  draw() {
    return {
      labelOnly: true,
      labelVisible: ({ node }) => node.readonly,
      drawNode(row, { node }) {
        if (node.readonly) {
          row.add(
            node.readonly ? (source.config.enableNerdfont ? '' : 'RO') : '',
            {
              hl: bufferHighlights.readonly,
            },
          );
        }
      },
    };
  },
}));
