import { fileColumnManager } from '../column-manager';
import { sourceIcons } from '../../../source';

fileColumnManager.registerColumn('selection', (source) => ({
  draw(row, node) {
    if (source.isSelectedAny()) {
      row.add(source.isSelectedNode(node) ? sourceIcons.selected : sourceIcons.unselected);
      row.add(' ');
    }
  },
}));
