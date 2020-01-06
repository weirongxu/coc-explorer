import { bufferColumnRegistrar } from '../buffer-column-registrar';
import { enableNerdfont } from '../../../source';
import { bufferHighlights } from '../buffer-source';

bufferColumnRegistrar.registerColumn('readonly', () => ({
  draw(row, node) {
    if (node.readonly) {
      row.add(node.readonly ? (enableNerdfont ? '' : 'RO') : '', bufferHighlights.readonly);
      row.add(' ');
    }
  },
}));
