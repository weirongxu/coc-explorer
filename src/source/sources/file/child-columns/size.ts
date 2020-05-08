import prettyBytes from 'pretty-bytes';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'size', () => ({
  draw() {
    return {
      labelVisible: ({ node }) => !node.directory,
      drawNode(row, { node }) {
        if (node.lstat) {
          row.add(prettyBytes(node.lstat.size), { hl: fileHighlights.size });
        }
      },
    };
  },
}));
