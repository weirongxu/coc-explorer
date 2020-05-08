import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'readonly', ({ source }) => ({
  labelOnly: true,
  draw() {
    const enabledNerdFont = source.config.enableNerdfont;

    return {
      labelVisible: ({ node }) => node.readonly,
      drawNode(row, { node }) {
        if (node.readonly) {
          row.add(node.readonly ? (enabledNerdFont ? '' : 'RO') : '', {
            hl: fileHighlights.readonly,
          });
        }
      },
    };
  },
}));
