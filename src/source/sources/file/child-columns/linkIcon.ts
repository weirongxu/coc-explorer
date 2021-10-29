import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'linkIcon', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.symbolicLink) {
          row.add(source.icons.link, { hl: fileHighlights.linkTarget });
        }
      },
    };
  },
}));
