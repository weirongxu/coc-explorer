import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import { hlGroupManager } from '../../../highlight-manager';

fileColumnRegistrar.registerColumn('selection', (source) => ({
  concealable: hlGroupManager.concealable('FileSelection'),
  async beforeDraw() {
    if (source.isSelectedAny()) {
      await this.concealable?.show(source);
    } else {
      await this.concealable?.hide(source);
    }
  },
  draw(row, node) {
    row.add(source.isSelectedNode(node) ? sourceIcons.selected : sourceIcons.unselected);
    row.add(' ');
  },
}));
