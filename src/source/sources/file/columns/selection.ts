import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import { hlGroupManager } from '../../../highlight-manager';

const concealable = hlGroupManager.concealable('FileSelection');

fileColumnRegistrar.registerColumn('selection', ({ source, column }) => ({
  concealable: concealable(source),
  async beforeDraw() {
    if (source.isSelectedAny()) {
      column.concealable.show();
    } else {
      column.concealable.hide();
    }
  },
  draw(row, node) {
    row.add(source.isSelectedNode(node) ? sourceIcons.getSelected() : sourceIcons.getUnselected());
  },
}));
