import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  bufname: hlGroupManager.linkGroup('BufferBufname', 'Comment'),
};

bufferColumnRegistrar.registerColumn('bufname', {
  draw(row, node) {
    if (node.basename !== node.bufname) {
      row.add(node.bufname, highlights.bufname);
      row.add(' ');
    }
  },
});
