import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(
          source.nodeStores.isExpanded(node)
            ? source.icons.expanded
            : source.icons.collapsed,
          { hl: fileHighlights.expandIcon },
        );
      },
    };
  },
}));
