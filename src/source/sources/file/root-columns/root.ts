import { fileColumnRegistrar } from '../file-column-registrar';
import pathLib from 'path';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('root', 'root', ({ source }) => ({
  draw(row) {
    row.add(pathLib.basename(source.root), { hl: fileHighlights.rootName });
  },
}));
