import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw() {
    return {
      drawNode(row) {
        row.add(
          `[BOOKMARK${source.showHidden ? ' ' + source.icons.hidden : ''}]`,
          {
            hl: bookmarkHighlights.title,
          },
        );
      },
    };
  },
}));
