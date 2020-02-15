import { fileColumnRegistrar } from '../file-column-registrar';
import dayjs from 'dayjs';
import { getDatetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('child', 'accessed', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.atime).format(getDatetimeFormat()), {
        hl: fileHighlights.timeAccessed,
      });
    } else {
      row.add('                 ');
    }
  },
}));
