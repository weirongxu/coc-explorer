import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'hidden', ({ source }) => ({
  draw() {
    return {
      drawNode(row) {
        row.add(source.showHidden ? source.icons.hidden : '', {
          hl: fileHighlights.hidden,
        });
      },
    };
  },
}));
