import { fileColumnRegistrar } from '../file-column-registrar';
import { format } from 'date-fns';
import { getDatetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('child', 'timeModified', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(format(node.lstat.mtime, getDatetimeFormat()), {
        hl: fileHighlights.timeModified,
      });
    }
  },
}));
