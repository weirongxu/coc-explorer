import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw(row, node) {
    row.add(
      source.expandStore.isExpanded(node)
        ? source.icons.expanded
        : source.icons.collapsed,
      { hl: fileHighlights.expandIcon },
    );
  },
}));
