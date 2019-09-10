import { fileColumnManager } from '../column-manager';
import { sourceIcons } from '../../..';

fileColumnManager.registerColumn('selection', (source) => ({
  draw(row, item) {
    if (source.isSelectedAny()) {
      row.add(source.isSelectedItem(item) ? sourceIcons.selected : sourceIcons.unselected);
      row.add(' ');
    }
  },
}));
