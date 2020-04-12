import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('child', 'modified', ({ source }) => ({
  labelOnly: true,
  labelVisible: (node) => source.bufManager.modified(node.fullpath),
  draw(row, node) {
    let modified: boolean = false;
    if (node.directory) {
      if (!source.expandStore.isExpanded(node)) {
        modified = source.bufManager.modifiedPrefix(node.fullpath);
      }
    } else {
      modified = source.bufManager.modified(node.fullpath);
    }
    row.add(modified ? '+' : '', {
      hl: fileHighlights.readonly,
    });
  },
}));
