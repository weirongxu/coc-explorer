import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'modified', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node, nodeIndex }) {
        const ch = node.modified ? '+' : node.modifiable ? '' : '-';
        if (ch) {
          row.add(ch, { hl: bufferHighlights.modified });
        }

        node.modified
          ? source.addIndexes('modified', nodeIndex)
          : source.removeIndexes('modified', nodeIndex);
      },
    };
  },
}));
