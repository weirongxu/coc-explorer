import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';

const highlights = {
  warning: hlGroupManager.hlLinkGroupCommand('FileDiagnosticWarning', 'CocWarningSign'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('diagnosticWarning', {
  load() {
    diagnosticManager.warningReload();
  },
  draw(row, item) {
    if (Object.keys(diagnosticManager.warningPathCountStr).length > 0) {
      if (item.fullpath in diagnosticManager.warningPathCountStr) {
        row.add(
          diagnosticManager.warningPathCountStr[item.fullpath].padStart(diagnosticManager.errorMaxWidth),
          highlights.warning.group,
        );
      } else {
        row.add(' '.repeat(diagnosticManager.warningMaxWidth));
      }
      row.add(' ');
    }
  },
});
