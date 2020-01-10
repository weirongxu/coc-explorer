import { fileColumnRegistrar } from '../file-column-registrar';
import dayjs from 'dayjs';
import { datetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('created', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.ctime).format(datetimeFormat), fileHighlights.timeCreated);
    } else {
      row.add('                 ');
    }
    row.add(' ');
  },
}));
