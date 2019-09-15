import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  bufname: hlGroupManager.hlLinkGroupCommand('BufferBufname', 'Comment'),
};
hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('bufname', {
  draw(row, item) {
    if (item.basename !== item.bufname) {
      row.add(item.bufname, highlights.bufname.group);
      row.add(' ');
    }
  },
});
