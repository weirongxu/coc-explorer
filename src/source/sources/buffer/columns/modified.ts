import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  modified: hlGroupManager.linkGroup('BufferModified', 'Operator'),
};

bufferColumnRegistrar.registerColumn('modified', () => ({
  draw(row, node) {
    row.add(node.modified ? '+' : node.modifiable ? '' : '-', highlights.modified);
    row.add(' ');
  },
}));
