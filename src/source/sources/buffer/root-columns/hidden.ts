import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('root', 'hidden', ({ source }) => ({
  draw() {
    return {
      drawNode(row) {
        row.add(source.showHidden ? source.icons.hidden : '', {
          hl: bufferHighlights.hidden,
        });
      },
    };
  },
}));
