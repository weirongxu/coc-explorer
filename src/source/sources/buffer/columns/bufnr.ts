import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { max } from '../../../../util';

const highlights = {
  bufnr: hlGroupManager.hlLinkGroupCommand('BufferBufnr', 'Special'),
};

hlGroupManager.register(highlights);

let maxBufnrWidth = 0;

bufferColumnManager.registerColumn('bufnr', (source) => ({
  beforeDraw() {
    maxBufnrWidth = max(source.items.map((item) => item.bufnrStr.length));
  },
  draw(row, item) {
    row.add(item.bufnrStr.padStart(maxBufnrWidth), highlights.bufnr);
    row.add(' ');
  },
}));
