import { hlGroupManager } from '../../../highlight-manager';
import { bufferColumnManager } from '../column-manager';

const highlights = {
  nameVisible: hlGroupManager.hlLinkGroupCommand('BufferNameVisible', 'String'),
};

bufferColumnManager.registerColumn('name', {
  draw(row, node) {
    if (node.visible) {
      row.add(node.basename, highlights.nameVisible);
    } else {
      row.add(node.basename);
    }
    row.add(' ');
  },
});
