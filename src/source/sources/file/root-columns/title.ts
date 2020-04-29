import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { sourceIcons } from '../../../source';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw(row) {
    row.add(`[FILE${source.showHidden ? ' ' + sourceIcons.getHidden() : ''}]:`, {
      hl: fileHighlights.title,
    });
  },
}));
