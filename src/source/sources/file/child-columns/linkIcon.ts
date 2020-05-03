import { fileColumnRegistrar } from '../fileColumnRegistrar';

fileColumnRegistrar.registerColumn('child', 'linkIcon', () => ({
  drawLine(row, node) {
    if (node.symbolicLink) {
      row.add('→');
    }
  },
}));
