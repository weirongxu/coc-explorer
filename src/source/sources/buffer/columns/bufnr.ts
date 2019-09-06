import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  bufnr: hlGroupManager.hlLinkGroupCommand('BufferBufnr', 'Special'),
};

hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('bufnr', {
  draw(row, item) {
    row.add(item.bufnr.toString(), highlights.bufnr.group);
    row.add(' ');
  },
});
