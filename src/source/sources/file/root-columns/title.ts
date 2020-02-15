import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('root', 'title', ({ source }) => ({
  draw(row) {
    row.add(`[FILE${source.showHidden ? ' ' + sourceIcons.getHidden() : ''}]:`, {
      hl: fileHighlights.title,
    });
  },
}));
