import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('root', 'hidden', ({ source }) => ({
  draw() {
    return {
      drawNode(row) {
        row.add(source.showHidden ? source.icons.hidden : '', {
          hl: bookmarkHighlights.hidden,
        });
      },
    };
  },
}));
