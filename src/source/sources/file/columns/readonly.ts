import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';
import { getEnableNerdfont } from '../../../../util';

fileColumnRegistrar.registerColumn('readonly', () => ({
  labelOnly: true,
  labelVisible: (node) => node.readonly,
  draw(row, node) {
    if (node.readonly) {
      row.add(node.readonly ? (getEnableNerdfont() ? '' : 'RO') : '', {
        hl: fileHighlights.readonly,
      });
    }
  },
}));
