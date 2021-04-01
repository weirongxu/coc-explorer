import { displayedFullpath } from '../../../../util';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'fullpath', () => ({
  draw() {
    return {
      drawNode(row, { node }) {
        row.add(displayedFullpath(node.fullpath), {
          hl: bufferHighlights.fullpath,
        });
      },
    };
  },
}));
