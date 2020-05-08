import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'fullpath', () => ({
  draw() {
    return {
      drawNode(row, { node, isLabeling }) {
        row.add(node.fullpath, {
          hl: isLabeling ? fileHighlights.directory : fileHighlights.fullpath,
        });
      },
    };
  },
}));
