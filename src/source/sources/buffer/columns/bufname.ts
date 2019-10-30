import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  bufname: hlGroupManager.hlLinkGroupCommand('BufferBufname', 'Comment'),
};
hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('bufname', {
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.bufname, highlights.bufname);
      row.add(' ');
    }
  },
});
