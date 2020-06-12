import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('child', 'line', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(node.line, { hl: bookmarkHighlights.line });
      },
    };
  },
}));
