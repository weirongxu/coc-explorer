import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('child', 'annotation', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.annotation) {
          row.add(node.annotation, { hl: bookmarkHighlights.annotation });
        }
      },
    };
  },
}));
