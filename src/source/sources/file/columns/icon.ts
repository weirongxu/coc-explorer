import { expandStore } from '..';
import { fileColumnManager } from '../column-manager';
import { sourceIcons } from '../../..';

const enableDevicons = fileColumnManager.getColumnConfig<string>('icon.enableDevicons');
const space = ' '.repeat(sourceIcons.shrinked.length);

fileColumnManager.registerColumn('icon', {
  draw(row, item) {
    if (item.directory) {
      row.add(expandStore.isExpanded(item.fullpath) ? sourceIcons.expanded : sourceIcons.shrinked);
      row.add(' ');
    } else {
      row.add(space);
      row.add(' ');
    }
  },
});
