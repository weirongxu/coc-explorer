import prettyBytes from 'pretty-bytes';
import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  size: hlGroupManager.hlLinkGroupCommand('FileSize', 'Constant'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('size', {
  draw(row, node) {
    if (node.lstat) {
      row.add(prettyBytes(node.lstat.size).padStart(10), highlights.size);
    } else {
      row.add(' '.repeat(10));
    }
    row.add(' ');
  },
});
