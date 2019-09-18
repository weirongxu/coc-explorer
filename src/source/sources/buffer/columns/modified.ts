import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  modified: hlGroupManager.hlLinkGroupCommand('BufferModified', 'Operator'),
};

hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('modified', {
  draw(row, item) {
    row.add(item.modified ? '+' : '', highlights.modified);
    row.add(' ');
  },
});
