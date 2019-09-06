import { bufferColumnManager } from '../column-manager';
import { config } from '../../../../util';

const selected = config.get<string>('column.selection.selected')!;
const unselected = config.get<string>('column.selection.unselected')!;

bufferColumnManager.registerColumn('selection', (source) => ({
  draw(row, item) {
    if (source.isSelectedAny()) {
      row.add(source.isSelectedItem(item) ? selected : unselected);
      row.add(' ');
    }
  },
}));
