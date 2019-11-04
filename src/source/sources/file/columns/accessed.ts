import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.hlLinkGroupCommand('TimeAccessed', 'Identifier'),
};

fileColumnManager.registerColumn('accessed', {
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.atime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
});
