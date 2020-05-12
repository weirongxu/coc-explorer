import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'modified', ({ source }) => ({
  labelOnly: true,
  draw() {
    return {
      labelVisible: ({ node }) => source.bufManager.modified(node.fullpath),
      drawNode(row, { node, nodeIndex }) {
        let modified: boolean = false;
        if (node.directory) {
          if (!source.nodeStores.isExpanded(node)) {
            modified = source.bufManager.modifiedPrefix(node.fullpath);
          }
        } else {
          modified = source.bufManager.modified(node.fullpath);
        }
        row.add(modified ? '+' : '', {
          hl: fileHighlights.readonly,
        });
        modified
          ? source.addIndexes('modified', nodeIndex)
          : source.removeIndexes('modified', nodeIndex);
      },
    };
  },
}));
