import { fileColumnRegistrar } from '../fileColumnRegistrar';

fileColumnRegistrar.registerColumn('child', 'linkIcon', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.symbolicLink) {
          row.add('→');
        }
      },
    };
  },
}));
