import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  modified: hlGroupManager.hlLinkGroupCommand('BufferModified', 'Operator'),
};

hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('modified', {
  draw(row, node) {
    row.add(node.modified ? '+' : node.modifiable ? '' : '-', highlights.modified);
    row.add(' ');
  },
});
