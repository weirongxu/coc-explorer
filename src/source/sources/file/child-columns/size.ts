import prettyBytes from 'pretty-bytes';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'size', () => ({
  labelVisible: (node) => !node.directory,
  draw(row, node) {
    if (node.lstat) {
      row.add(prettyBytes(node.lstat.size), { hl: fileHighlights.size });
    }
  },
}));
