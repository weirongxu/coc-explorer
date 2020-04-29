import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'fullpath', ({ source }) => ({
  draw(row) {
    row.add(source.root, { hl: fileHighlights.fullpath });
  },
}));
