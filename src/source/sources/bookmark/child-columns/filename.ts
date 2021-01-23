import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('child', 'filename', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(node.name, { hl: bookmarkHighlights.filename });
      },
    };
  },
}));
