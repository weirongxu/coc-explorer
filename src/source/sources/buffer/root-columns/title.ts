import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('root', 'title', () => ({
  draw() {
    return {
      drawNode(row) {
        row.add('[BUFFER]', {
          hl: bufferHighlights.title,
        });
      },
    };
  },
}));
