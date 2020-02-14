import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { bufferHighlights } from '../buffer-source';
import { getEnableNerdfont } from '../../../../util';

bufferColumnRegistrar.registerColumn('readonly', () => ({
  labelOnly: true,
  labelVisible: (node) => node.readonly,
  draw(row, node) {
    if (node.readonly) {
      row.add(node.readonly ? (getEnableNerdfont() ? '' : 'RO') : '', {
        hl: bufferHighlights.readonly,
      });
    }
  },
}));
