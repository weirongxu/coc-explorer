import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { getEnableNerdfont } from '../../../../util';

fileColumnRegistrar.registerColumn('child', 'readonly', () => ({
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
