import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';

const highlights = {
  warning: hlGroupManager.hlLinkGroupCommand('FileDiagnosticWarning', 'CocWarningSign'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('diagnosticWarning', (fileSource) => ({
  load() {
    diagnosticManager.warningReload(fileSource.root);
  },
  beforeDraw() {
    fileSource.diagnosisLineIndexes = [];
  },
  draw(row, item) {
    if (Object.keys(diagnosticManager.warningMixedCount).length > 0) {
      if (item.fullpath in diagnosticManager.warningMixedCount) {
        const count = diagnosticManager.warningMixedCount[item.fullpath];
        row.add(count.toString().padStart(diagnosticManager.warningMaxWidth), highlights.warning);
        fileSource.diagnosisLineIndexes.push(row.line);
      } else {
        row.add(' '.repeat(diagnosticManager.warningMaxWidth));
      }
      row.add(' ');
    }
  },
}));
