import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { sourceIcons } from '../../../source';

bufferColumnRegistrar.registerColumn('child', 'selection', ({ source }) => ({
  draw(row, node) {
    if (source.isSelectedNode(node)) {
      row.add(sourceIcons.getSelected());
    }
  },
}));
