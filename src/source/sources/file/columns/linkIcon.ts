import { fileColumnRegistrar } from '../file-column-registrar';

fileColumnRegistrar.registerColumn('linkIcon', () => ({
  draw(row, node) {
    if (node.symbolicLink) {
      row.add('→');
    }
  },
}));
