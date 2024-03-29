import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'title', () => ({
  draw() {
    return {
      drawNode(row) {
        row.add('[FILE]', {
          hl: fileHighlights.title,
        });
      },
    };
  },
}));
