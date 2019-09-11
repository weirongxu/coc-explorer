import { hlGroupManager } from '../../../highlight-manager';
import { bufferColumnManager } from '../column-manager';

const highlights = {
  nameActive: hlGroupManager.hlLinkGroupCommand('BufferNameActive', 'String'),
};

hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('name', {
  draw(row, item) {
    if (item.visible) {
      row.add(item.basename, highlights.nameActive.group);
    } else {
      row.add(item.basename);
    }
    row.add(' ');
  },
});
