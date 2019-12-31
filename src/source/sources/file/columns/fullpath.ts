import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnRegistrar } from '../file-column-registrar';

export const highlights = {
  directory: hlGroupManager.linkGroup('FileDirectory', 'Directory'),
  linkTarget: hlGroupManager.linkGroup('FileLinkTarget', 'Comment'),
};

fileColumnRegistrar.registerColumn('fullpath', () => ({
  draw(row, node) {
    if (node.directory) {
      row.add(node.fullpath + '/', highlights.directory);
    } else {
      row.add(node.fullpath);
    }
    row.add(' ');
  },
}));
