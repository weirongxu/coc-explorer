import prettyBytes from 'pretty-bytes';
import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  size: hlGroupManager.hlLinkGroupCommand('FileSize', 'Constant'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('size', {
  draw(row, item) {
    if (item.directory) {
      row.add(' '.repeat(10));
    } else {
      row.add(prettyBytes(item.stat.size).padStart(10), highlights.size);
    }
    row.add(' ');
  },
});
