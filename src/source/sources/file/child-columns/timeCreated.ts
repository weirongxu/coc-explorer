import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { format } from 'date-fns';
import { getDatetimeFormat } from '../../../../util';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'timeCreated', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(format(node.lstat.ctime, getDatetimeFormat()), {
        hl: fileHighlights.timeCreated,
      });
    }
  },
}));
