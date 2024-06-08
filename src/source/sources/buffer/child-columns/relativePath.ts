import pathLib from 'path';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'relativePath', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        const relativePath = pathLib.relative(source.root, node.fullpath);
        row.add(relativePath, {
          hl: bufferHighlights.fullpath,
        });
      },
    };
  },
}));
