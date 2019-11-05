import { bufferColumnManager } from '../column-manager';
import { sourceIcons } from '../../../source';
import { hlGroupManager } from '../../../highlight-manager';

const hlColumn = hlGroupManager.hlColumnHide('BufferSelection');

bufferColumnManager.registerColumn('selection', (source) => ({
  async beforeDraw() {
    if (source.isSelectedAny()) {
      await hlColumn.show();
    } else {
      await hlColumn.hide();
    }
  },
  draw(row, node) {
    row.addColumn(hlColumn, () => {
      row.add(source.isSelectedNode(node) ? sourceIcons.selected : sourceIcons.unselected);
      row.add(' ');
    });
  },
}));
