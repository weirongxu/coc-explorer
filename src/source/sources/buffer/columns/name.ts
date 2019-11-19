import { hlGroupManager } from '../../../highlight-manager';
import { bufferColumnRegistrar } from '../buffer-column-registrar';

const highlights = {
  nameVisible: hlGroupManager.linkGroup('BufferNameVisible', 'String'),
};

bufferColumnRegistrar.registerColumn('name', {
  draw(row, node) {
    if (node.visible) {
      row.add(node.basename, highlights.nameVisible);
    } else {
      row.add(node.basename);
    }
    row.add(' ');
  },
});
