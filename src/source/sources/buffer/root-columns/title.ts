import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { sourceIcons } from '../../../source';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw(row) {
    row.add(`[BUFFER${source.showHidden ? ' ' + sourceIcons.getHidden() : ''}]`, {
      hl: bufferHighlights.title,
    });
  },
}));
