import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import dayjs from 'dayjs';

const highlights = {
  time: hlGroupManager.hlLinkGroupCommand('TimeModified', 'Identifier'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('modified', {
  draw(row, item) {
    row.add(dayjs(item.stat.mtime).format('YY/MM/DD HH:mm:ss'), highlights.time);
    row.add(' ');
  },
});
