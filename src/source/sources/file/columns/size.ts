import prettyBytes from 'pretty-bytes';
import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('size', () => ({
  draw(row, node, { isLabeling }) {
    if (node.lstat) {
      if (isLabeling) {
        row.add(prettyBytes(node.lstat.size), { hl: fileHighlights.size });
      } else {
        row.add(prettyBytes(node.lstat.size).padStart(10), { hl: fileHighlights.size });
      }
    } else {
      row.add(' '.repeat(10));
    }
  },
}));
