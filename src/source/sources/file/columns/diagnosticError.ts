import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticUI } from '../diagnostic-ui';

const highlights = {
  error: hlGroupManager.hlLinkGroupCommand('FileDiagnosticError', 'CocErrorSign'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('diagnosticError', {
  beforeDraw() {
    diagnosticUI.reload();
  },
  draw(row, item) {
    if (Object.keys(diagnosticUI.errorMap).length > 0) {
      if (item.fullpath in diagnosticUI.errorMap) {
        row.add(diagnosticUI.errorMap[item.fullpath].padStart(diagnosticUI.maxErrorWidth), highlights.error.group);
      } else {
        row.add(' '.repeat(diagnosticUI.maxErrorWidth));
      }
      row.add(' ');
    }
  },
});
