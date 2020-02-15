import { fileColumnRegistrar } from '../file-column-registrar';
import dayjs from 'dayjs';
import { getDatetimeFormat } from '../../../../util';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('child', 'created', () => ({
  draw(row, node) {
    if (node.lstat) {
      row.add(dayjs(node.lstat.ctime).format(getDatetimeFormat()), {
        hl: fileHighlights.timeCreated,
      });
    }
  },
}));
