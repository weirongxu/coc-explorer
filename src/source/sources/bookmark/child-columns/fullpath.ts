import { displayedFullpath } from '../../../../util';
import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('child', 'fullpath', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(displayedFullpath(node.fullpath), {
          hl: bookmarkHighlights.fullpath,
        });
      },
    };
  },
}));
