import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, max } from '../../../../util';

const highlights = {
  warning: hlGroupManager.linkGroup('FileDiagnosticWarning', 'CocWarningSign'),
};

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
let warningMixedCountStr: Record<string, string> = {};
let warningMaxWidth = 0;

fileColumnRegistrar.registerColumn('diagnosticWarning', (fileSource) => ({
  reload() {
    diagnosticManager.warningReload(fileSource.root);
  },
  beforeDraw() {
    fileSource.diagnosisLineIndexes = [];

    warningMixedCountStr = {};
    Object.entries(diagnosticManager.warningMixedCount).forEach(([fullpath, count]) => {
      if (count > diagnosticCountMax) {
        warningMixedCountStr[fullpath] = '●';
      } else {
        warningMixedCountStr[fullpath] = count.toString();
      }
    });
    warningMaxWidth = max(Object.values(warningMixedCountStr).map((d) => d.length));
  },
  draw(row, node) {
    if (Object.keys(warningMixedCountStr).length > 0) {
      if (node.fullpath in warningMixedCountStr) {
        if (node.directory && fileSource.expandStore.isExpanded(node)) {
          row.add(' '.padStart(warningMaxWidth), highlights.warning);
        } else {
          const count = warningMixedCountStr[node.fullpath];
          row.add(count.toString().padStart(warningMaxWidth), highlights.warning);
          // TODO remove
          // fileSource.diagnosisLineIndexes.push(row.line);
        }
      } else {
        row.add(' '.repeat(warningMaxWidth));
      }
      row.add(' ');
    }
  },
}));
