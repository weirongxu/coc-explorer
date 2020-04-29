import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { format } from 'date-fns';
import { getDatetimeFormat } from '../../../../util';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'timeAccessed', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(format(node.lstat.atime, getDatetimeFormat()), {
        hl: fileHighlights.timeAccessed,
      });
    } else {
      row.add('                 ');
    }
  },
}));
