import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';

fileColumnRegistrar.registerColumn('child', 'selection', ({ source }) => ({
  draw(row, node) {
    if (source.isSelectedNode(node)) {
      row.add(sourceIcons.getSelected());
    }
  },
}));
