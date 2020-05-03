import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'fullpath', ({ source }) => ({
  drawLine(row) {
    row.add(source.root, { hl: fileHighlights.fullpath });
  },
}));
