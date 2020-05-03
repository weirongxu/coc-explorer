import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  drawLine(row, node) {
    row.add(
      source.expandStore.isExpanded(node)
        ? source.icons.expanded
        : source.icons.collapsed,
      { hl: bufferHighlights.expandIcon },
    );
  },
}));
