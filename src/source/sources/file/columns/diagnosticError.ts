import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config } from '../../../../util';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
let errorMixedCountStr: Record<string, string> = {};
const errorMaxWidth = diagnosticCountMax.toString().length;

const highlights = {
  error: hlGroupManager.linkGroup('FileDiagnosticError', 'CocErrorSign'),
};

fileColumnRegistrar.registerColumn('diagnosticError', (source) => ({
  concealable: hlGroupManager.concealable('FileDiagnosticError'),
  reload() {
    diagnosticManager.errorReload(source.root);
  },
  beforeDraw() {
    source.diagnosisLineIndexes = [];

    errorMixedCountStr = {};
    Object.entries(diagnosticManager.errorMixedCount).forEach(([fullpath, count]) => {
      if (count > diagnosticCountMax) {
        errorMixedCountStr[fullpath] = '●';
      } else {
        errorMixedCountStr[fullpath] = count.toString();
      }
    });
    if (Object.keys(diagnosticManager.errorMixedCount).length) {
      this.concealable?.show();
    } else {
      this.concealable?.hide();
    }
  },
  draw(row, node, nodeIndex) {
    if (node.fullpath in diagnosticManager.errorMixedCount) {
      if (node.directory && source.expandStore.isExpanded(node)) {
        row.add(' '.padStart(errorMaxWidth));
        source.removeIndexes('diagnosticError', nodeIndex);
      } else {
        const count = errorMixedCountStr[node.fullpath];
        row.add(count.padStart(errorMaxWidth), highlights.error);
        source.addIndexes('diagnosticError', nodeIndex);
      }
    } else {
      row.add(' '.repeat(errorMaxWidth));
      source.removeIndexes('diagnosticError', nodeIndex);
    }
    row.add(' ');
  },
}));
