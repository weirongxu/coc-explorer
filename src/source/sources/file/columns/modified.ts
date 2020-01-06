import { fileColumnRegistrar } from '../file-column-registrar';
import dayjs from 'dayjs';
import { datetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('modified', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.mtime).format(datetimeFormat), fileHighlights.timeModified);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
}));
