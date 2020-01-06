import { fileColumnRegistrar } from '../file-column-registrar';
import dayjs from 'dayjs';
import { datetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('accessed', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.atime).format(datetimeFormat), fileHighlights.timeAccessed);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
}));
