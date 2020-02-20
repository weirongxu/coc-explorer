import prettyBytes from 'pretty-bytes';
import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('child', 'size', () => ({
  labelVisible: (node) => !node.directory,
  draw(row, node) {
    if (node.lstat) {
      row.add(prettyBytes(node.lstat.size), { hl: fileHighlights.size });
    }
  },
}));
