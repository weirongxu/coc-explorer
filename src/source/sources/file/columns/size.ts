import prettyBytes from 'pretty-bytes';
import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  size: hlGroupManager.linkGroup('FileSize', 'Constant'),
};

fileColumnRegistrar.registerColumn('size', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(prettyBytes(node.lstat.size).padStart(10), highlights.size);
    } else {
      row.add(' '.repeat(10));
    }
    row.add(' ');
  },
}));
