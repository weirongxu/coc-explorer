import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { max } from '../../../../util';

const highlights = {
  bufnr: hlGroupManager.linkGroup('BufferBufnr', 'Special'),
};


bufferColumnRegistrar.registerColumn('bufnr', (_source, data) => ({
  beforeDraw(nodes) {
    const maxBufnrWidth = max(nodes.map((node) => node.bufnrStr.length));
    if (data.maxBufnrWidth !== maxBufnrWidth) {
      data.maxBufnrWidth = maxBufnrWidth;
      return true;
    }
  },
  draw(row, node) {
    row.add(node.bufnrStr.padStart(data.maxBufnrWidth), highlights.bufnr);
    row.add(' ');
  },
}), () => ({
  maxBufnrWidth: 0,
}));
