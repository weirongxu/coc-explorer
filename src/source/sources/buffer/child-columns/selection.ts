import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn('child', 'selection', ({ source }) => ({
  drawLine(row, node) {
    if (source.isSelectedNode(node)) {
      row.add(source.icons.selected);
    }
  },
}));
