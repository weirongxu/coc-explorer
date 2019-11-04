import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  fullpath: hlGroupManager.hlLinkGroupCommand('BufferFullpath', 'Comment'),
};

bufferColumnManager.registerColumn('fullpath', {
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.fullpath, highlights.fullpath);
      row.add(' ');
    }
  },
});
