import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('child', 'position', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(`line: ${node.lnum}`, { hl: bookmarkHighlights.position });
      },
    };
  },
}));
