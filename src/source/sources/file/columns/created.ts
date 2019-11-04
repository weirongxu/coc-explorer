import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.hlLinkGroupCommand('TimeCreated', 'Identifier'),
};

fileColumnManager.registerColumn('created', {
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.ctime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
});
