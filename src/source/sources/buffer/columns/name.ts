import { hlGroupManager } from '../../../highlight-manager';
import { bufferColumnManager } from '../column-manager';

const highlights = {
  nameVisible: hlGroupManager.hlLinkGroupCommand('BufferNameVisible', 'String'),
};

hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('name', {
  draw(row, item) {
    if (item.visible) {
      row.add(item.basename, highlights.nameVisible.group);
    } else {
      row.add(item.basename);
    }
    row.add(' ');
  },
});
