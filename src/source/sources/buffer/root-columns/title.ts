import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { sourceIcons } from '../../../source';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw(row) {
    row.add(`[BUFFER${source.showHidden ? ' ' + sourceIcons.getHidden() : ''}]`, {
      hl: bufferHighlights.title,
    });
  },
}));
