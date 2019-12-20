import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import { hlGroupManager } from '../../../highlight-manager';

const concealable = hlGroupManager.concealable('FileSelection');

fileColumnRegistrar.registerColumn('selection', (source) => ({
  concealable,
  async beforeDraw() {
    if (source.isSelectedAny()) {
      this.concealable?.requestShow();
    } else {
      this.concealable?.requestHide();
    }
  },
  draw(row, node) {
    row.add(source.isSelectedNode(node) ? sourceIcons.selected : sourceIcons.unselected);
    row.add(' ');
  },
}));
