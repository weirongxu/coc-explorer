import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw(row, node) {
    row.add(
      source.expandStore.isExpanded(node) ? sourceIcons.getExpanded() : sourceIcons.getCollapsed(),
      { hl: fileHighlights.expandIcon },
    );
  },
}));
