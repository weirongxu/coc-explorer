import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticUI } from '../diagnostic-ui';

const highlights = {
  warning: hlGroupManager.hlLinkGroupCommand('FileDiagnosticWarning', 'CocWarningSign'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('diagnosticWarning', {
  beforeDraw() {
    diagnosticUI.reload();
  },
  draw(row, item) {
    if (Object.keys(diagnosticUI.warningMap).length > 0) {
      if (item.fullpath in diagnosticUI.warningMap) {
        row.add(diagnosticUI.warningMap[item.fullpath].padStart(diagnosticUI.maxErrorWidth), highlights.warning.group);
      } else {
        row.add(' '.repeat(diagnosticUI.maxWarningWidth));
      }
      row.add(' ');
    }
  },
});
