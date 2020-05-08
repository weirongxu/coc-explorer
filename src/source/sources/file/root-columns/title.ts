import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw() {
    return {
      drawNode(row) {
        row.add(
          `[FILE${source.showHidden ? ' ' + source.icons.hidden : ''}]:`,
          {
            hl: fileHighlights.title,
          },
        );
      },
    };
  },
}));
