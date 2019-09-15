import { bufferColumnManager } from '../column-manager';
import { sourceIcons } from '../../../source';

bufferColumnManager.registerColumn('selection', (source) => ({
  draw(row, item) {
    if (source.isSelectedAny()) {
      row.add(source.isSelectedItem(item) ? sourceIcons.selected : sourceIcons.unselected);
      row.add(' ');
    }
  },
}));
