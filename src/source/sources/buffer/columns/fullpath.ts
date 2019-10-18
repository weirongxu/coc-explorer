import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  fullpath: hlGroupManager.hlLinkGroupCommand('BufferFullpath', 'Comment'),
};
hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('fullpath', {
  draw(row, item) {
    if (item.basename !== item.bufname) {
      row.add(item.fullpath, highlights.fullpath);
      row.add(' ');
    }
  },
});
