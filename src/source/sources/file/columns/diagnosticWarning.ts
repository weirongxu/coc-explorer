import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config } from '../../../../util';

const highlights = {
  warning: hlGroupManager.linkGroup('FileDiagnosticWarning', 'CocWarningSign'),
};

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
let warningMixedCountStr: Record<string, string> = {};
const warningMaxWidth = diagnosticCountMax.toString().length;

fileColumnRegistrar.registerColumn('diagnosticWarning', (source) => ({
  reload() {
    diagnosticManager.warningReload(source.root);
  },
  beforeDraw() {
    source.diagnosisLineIndexes = [];

    warningMixedCountStr = {};
    Object.entries(diagnosticManager.warningMixedCount).forEach(([fullpath, count]) => {
      if (count > diagnosticCountMax) {
        warningMixedCountStr[fullpath] = '●';
      } else {
        warningMixedCountStr[fullpath] = count.toString();
      }
    });
    if (Object.keys(diagnosticManager.warningMixedCount).length) {
      this.concealable?.show();
    } else {
      this.concealable?.hide();
    }
  },
  draw(row, node, nodeIndex) {
    if (node.fullpath in warningMixedCountStr) {
      if (node.directory && source.expandStore.isExpanded(node)) {
        row.add(' '.padStart(warningMaxWidth), highlights.warning);
        source.removeIndexes('diagnosticWarning', nodeIndex);
      } else {
        const count = warningMixedCountStr[node.fullpath];
        row.add(count.toString().padStart(warningMaxWidth), highlights.warning);
        source.addIndexes('diagnosticWarning', nodeIndex);
      }
    } else {
      row.add(' '.repeat(warningMaxWidth));
      source.removeIndexes('diagnosticWarning', nodeIndex);
    }
    row.add(' ');
  },
}));
