import prettyBytes from 'pretty-bytes';
import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { truncate } from '../../../../util';

const highlights = {
  size: hlGroupManager.hlLinkGroupCommand('FileSize', 'Constant'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('size', {
  draw(row, item) {
    if (item.directory) {
      row.add(' '.repeat(10));
    } else {
      row.add(truncate(prettyBytes(item.stat.size), 10, 'start'), highlights.size.group);
    }
    row.add(' ');
  },
});
