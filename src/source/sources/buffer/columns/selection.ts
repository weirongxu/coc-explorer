import { bufferColumnManager } from '../column-manager';
import { sourceIcons } from '../../..';

bufferColumnManager.registerColumn('selection', (source) => ({
  draw(row, item) {
    if (source.isSelectedAny()) {
      row.add(source.isSelectedItem(item) ? sourceIcons.selected : sourceIcons.unselected);
      row.add(' ');
    }
  },
}));
