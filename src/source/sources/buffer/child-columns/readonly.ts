import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';
import { getEnableNerdfont } from '../../../../util';

bufferColumnRegistrar.registerColumn('child', 'readonly', () => ({
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
