import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { sourceIcons } from '../../../source';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw(row, node) {
    row.add(
      source.expandStore.isExpanded(node) ? sourceIcons.getExpanded() : sourceIcons.getCollapsed(),
      { hl: bufferHighlights.expandIcon },
    );
  },
}));
