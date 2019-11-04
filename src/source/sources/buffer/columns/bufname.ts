import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  bufname: hlGroupManager.hlLinkGroupCommand('BufferBufname', 'Comment'),
};

bufferColumnManager.registerColumn('bufname', {
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.bufname, highlights.bufname);
      row.add(' ');
    }
  },
});
