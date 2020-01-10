import { fileColumnRegistrar } from '../file-column-registrar';
import { enableNerdfont } from '../../../source';
import { fileHighlights } from '../file-source';

fileColumnRegistrar.registerColumn('readonly', () => ({
  labelOnly: (node) => node.readonly,
  draw(row, node) {
    if (node.readonly) {
      row.add(node.readonly ? (enableNerdfont ? '' : 'RO') : '', fileHighlights.readonly);
      row.add(' ');
    }
  },
}));
