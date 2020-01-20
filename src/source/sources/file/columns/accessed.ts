import { fileColumnRegistrar } from '../file-column-registrar';
import dayjs from 'dayjs';
import { getDatetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('accessed', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.atime).format(getDatetimeFormat()), fileHighlights.timeAccessed);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
}));
