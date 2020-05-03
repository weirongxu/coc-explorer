import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw(row) {
    row.add(`[BUFFER${source.showHidden ? ' ' + source.icons.hidden : ''}]`, {
      hl: bufferHighlights.title,
    });
  },
}));
