import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('root', 'fullpath', ({ source }) => ({
  draw(row) {
    row.add(source.root, { hl: fileHighlights.fullpath });
  },
}));
