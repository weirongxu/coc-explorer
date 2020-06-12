import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('root', 'title', () => ({
  draw() {
    return {
      drawNode(row) {
        row.add('[BOOKMARK]', { hl: bookmarkHighlights.title });
      },
    };
  },
}));
