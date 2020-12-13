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
          ? source.locator.mark.add('modified', nodeIndex)
          : source.locator.mark.remove('modified', nodeIndex);
      },
    };
  },
}));
