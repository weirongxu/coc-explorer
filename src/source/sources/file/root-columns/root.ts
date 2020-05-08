import { fileColumnRegistrar } from '../fileColumnRegistrar';
import pathLib from 'path';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('root', 'root', ({ source }) => ({
  draw() {
    return {
      drawNode(row) {
        row.add(pathLib.basename(source.root), { hl: fileHighlights.rootName });
      },
    };
  },
}));
