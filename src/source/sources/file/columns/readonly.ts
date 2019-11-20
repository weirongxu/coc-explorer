import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { enableNerdfont } from '../../../source';

const highlights = {
  readonly: hlGroupManager.linkGroup('FileReadonly', 'Operator'),
};

fileColumnRegistrar.registerColumn('readonly', () => ({
  draw(row, node) {
    if (node.readonly) {
      row.add(node.readonly ? (enableNerdfont ? '' : 'RO') : '', highlights.readonly);
      row.add(' ');
    }
  },
}));
