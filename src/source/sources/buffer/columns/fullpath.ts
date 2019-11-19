import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  fullpath: hlGroupManager.linkGroup('BufferFullpath', 'Comment'),
};

bufferColumnRegistrar.registerColumn('fullpath', {
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.fullpath, highlights.fullpath);
      row.add(' ');
    }
  },
});
