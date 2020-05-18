import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'modified', ({ source }) => ({
  draw() {
    return {
      labelVisible({ node }) {
        return node.modified || !node.modifiable;
      },
      drawNode(row, { node, nodeIndex }) {
        const ch = node.modified ? '+' : node.modifiable ? '' : '-';
        if (ch) {
          row.add(ch, { hl: bufferHighlights.modified });
        }

        node.modified
          ? source.addIndexing('modified', nodeIndex)
          : source.removeIndexing('modified', nodeIndex);
      },
    };
  },
}));
