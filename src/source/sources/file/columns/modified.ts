import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.linkGroup('TimeModified', 'Identifier'),
};

fileColumnRegistrar.registerColumn('modified', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.mtime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
}));
