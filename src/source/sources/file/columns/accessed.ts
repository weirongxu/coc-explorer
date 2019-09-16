import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.hlLinkGroupCommand('TimeAccessed', 'Identifier'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('accessed', {
  draw(row, item) {
    row.add(dayjs(item.stat.atime).format('YY/MM/DD HH:mm:ss'), highlights.time.group);
    row.add(' ');
  },
});
