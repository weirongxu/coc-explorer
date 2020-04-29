import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { sourceIcons } from '../../../source';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('root', 'icon', ({ source }) => ({
  draw(row, node) {
    row.add(
      source.expandStore.isExpanded(node) ? sourceIcons.getExpanded() : sourceIcons.getCollapsed(),
      { hl: bufferHighlights.expandIcon },
    );
  },
}));
