import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { sourceIcons } from '../../../source';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw(row, node) {
    row.add(
      source.expandStore.isExpanded(node) ? sourceIcons.getExpanded() : sourceIcons.getCollapsed(),
      { hl: fileHighlights.expandIcon },
    );
  },
}));
