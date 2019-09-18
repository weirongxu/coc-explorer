import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.hlLinkGroupCommand('TimeCreated', 'Identifier'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('created', {
  draw(row, item) {
    row.add(dayjs(item.stat.ctime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    row.add(' ');
  },
});
