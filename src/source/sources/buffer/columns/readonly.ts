import { bufferColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { enableNerdfont } from '../../../source';

const highlights = {
  readonly: hlGroupManager.hlLinkGroupCommand('BufferReadonly', 'Operator'),
};

hlGroupManager.register(highlights);

bufferColumnManager.registerColumn('readonly', {
  draw(row, item) {
    if (item.readonly) {
      row.add(item.readonly ? (enableNerdfont ? '' : 'RO') : '', highlights.readonly);
      row.add(' ');
    }
  },
});
