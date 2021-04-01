import pathLib from 'path';
import { displayedFullpath } from '../../../../util';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'fullpath', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.directory) {
          row.add(displayedFullpath(node.fullpath) + pathLib.sep, {
            hl: fileHighlights.directory,
          });
        } else {
          row.add(node.fullpath);
        }
      },
    };
  },
}));
