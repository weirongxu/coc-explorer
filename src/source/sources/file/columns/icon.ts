import { expandStore } from '..';
import { fileColumnManager } from '../column-manager';

const expanded = fileColumnManager.getColumnConfig<string>('icon.expanded');
const shrinked = fileColumnManager.getColumnConfig<string>('icon.shrinked');
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
