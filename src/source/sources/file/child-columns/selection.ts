import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import { hlGroupManager } from '../../../highlight-manager';

const concealable = hlGroupManager.concealable('FileSelection');

fileColumnRegistrar.registerColumn('child', 'selection', ({ source, column }) => ({
  concealable: concealable(source),
  async beforeDraw() {
    if (source.isSelectedAny()) {
      column.concealable.show();
    } else {
      column.concealable.hide();
    }
  },
  draw(row, node) {
    if (source.isSelectedNode(node)) {
      row.add(sourceIcons.getSelected());
    }
  },
}));
