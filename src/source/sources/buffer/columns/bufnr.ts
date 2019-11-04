import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { max } from '../../../../util';

const highlights = {
  bufnr: hlGroupManager.hlLinkGroupCommand('BufferBufnr', 'Special'),
};


let maxBufnrWidth = 0;

bufferColumnManager.registerColumn('bufnr', (source) => ({
  beforeDraw() {
    maxBufnrWidth = max(source.rootNode.children.map((node) => node.bufnrStr.length));
  },
  draw(row, node) {
    row.add(node.bufnrStr.padStart(maxBufnrWidth), highlights.bufnr);
    row.add(' ');
  },
}));
