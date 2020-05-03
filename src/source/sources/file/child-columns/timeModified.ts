import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { format } from 'date-fns';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'timeModified', ({ source }) => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(format(node.lstat.mtime, source.config.datetimeFormat), {
        hl: fileHighlights.timeModified,
      });
    }
  },
}));
