import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'name', () => ({
  draw() {
    // TODO highlight name
    return {
      drawNode(row, { node }) {
        if (node.visible) {
          row.add(node.basename, { hl: bufferHighlights.nameVisible });
        } else {
          row.add(node.basename);
        }
      },
    };
  },
}));
