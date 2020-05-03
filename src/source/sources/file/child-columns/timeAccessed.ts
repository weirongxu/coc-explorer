import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { format } from 'date-fns';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'timeAccessed', ({ source }) => ({
  drawLine(row, node) {
    if (node.lstat) {
      row.add(format(node.lstat.atime, source.config.datetimeFormat), {
        hl: fileHighlights.timeAccessed,
      });
    } else {
      row.add('                 ');
    }
  },
}));
