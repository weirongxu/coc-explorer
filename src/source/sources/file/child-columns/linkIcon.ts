import { fileColumnRegistrar } from '../file-column-registrar';

fileColumnRegistrar.registerColumn('child', 'linkIcon', () => ({
  draw(row, node) {
    if (node.symbolicLink) {
      row.add('→');
    }
  },
}));
