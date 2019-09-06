import { expandStore } from '..';
import { fileColumnManager } from '../column-manager';

const expanded = fileColumnManager.getColumnConfig<string>('expandIcon.expanded');
const shrinked = fileColumnManager.getColumnConfig<string>('expandIcon.shrinked');
const space = ' '.repeat(shrinked.length);

fileColumnManager.registerColumn('expandIcon', {
  draw(row, item) {
    if (item.directory) {
      row.add(expandStore.isExpanded(item.fullpath) ? expanded : shrinked);
      row.add(' ');
    } else {
      row.add(space);
      row.add(' ');
    }
  },
});
