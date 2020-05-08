import { fileColumnRegistrar } from '../fileColumnRegistrar';

fileColumnRegistrar.registerColumn('child', 'selection', ({ source }) => ({
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
