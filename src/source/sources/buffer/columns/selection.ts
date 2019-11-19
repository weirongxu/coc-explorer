import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { sourceIcons } from '../../../source';
import { hlGroupManager } from '../../../highlight-manager';

bufferColumnRegistrar.registerColumn('selection', (source) => ({
  concealable: hlGroupManager.concealable('BufferSelection'),
  async beforeDraw() {
    if (source.isSelectedAny()) {
      await this.concealable?.show();
    } else {
      await this.concealable?.hide();
    }
  },
  draw(row, node) {
    row.add(source.isSelectedNode(node) ? sourceIcons.selected : sourceIcons.unselected);
    row.add(' ');
  },
}));
