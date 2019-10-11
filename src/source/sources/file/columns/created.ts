import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.hlLinkGroupCommand('TimeCreated', 'Identifier'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('created', {
  draw(row, item) {
    if (item.lstat) {
      row.add(dayjs(item.lstat.ctime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
});
