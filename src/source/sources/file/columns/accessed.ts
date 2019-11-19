import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.linkGroup('TimeAccessed', 'Identifier'),
};

fileColumnRegistrar.registerColumn('accessed', {
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.atime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
});
