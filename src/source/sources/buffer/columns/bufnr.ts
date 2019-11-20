import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { max } from '../../../../util';

const highlights = {
  bufnr: hlGroupManager.linkGroup('BufferBufnr', 'Special'),
};


let maxBufnrWidth = 0;

bufferColumnRegistrar.registerColumn('bufnr', (source) => ({
  beforeDraw() {
    if (source.rootNode.children) {
      maxBufnrWidth = max(source.rootNode.children.map((node) => node.bufnrStr.length));
    }
  },
  draw(row, node) {
    row.add(node.bufnrStr.padStart(maxBufnrWidth), highlights.bufnr);
    row.add(' ');
  },
}));
