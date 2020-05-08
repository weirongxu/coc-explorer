import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn('child', 'selection', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (source.isSelectedNode(node)) {
          row.add(source.icons.selected);
        }
      },
    };
  },
}));
