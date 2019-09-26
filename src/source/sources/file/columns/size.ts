import prettyBytes from 'pretty-bytes';
import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

const highlights = {
  size: hlGroupManager.hlLinkGroupCommand('FileSize', 'Constant'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('size', {
  draw(row, item) {
    row.add(prettyBytes(item.lstat.size).padStart(10), highlights.size);
    row.add(' ');
  },
});
