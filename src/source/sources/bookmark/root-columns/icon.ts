import { bookmarkColumnRegistrar } from '../bookmarkColumnRegistrar';
import { bookmarkHighlights } from '../bookmarkSource';

bookmarkColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(
          source.isExpanded(node)
            ? source.icons.expanded
            : source.icons.collapsed,
          { hl: bookmarkHighlights.expandIcon },
        );
      },
    };
  },
}));
