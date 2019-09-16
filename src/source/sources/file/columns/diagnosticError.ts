import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';

const highlights = {
  error: hlGroupManager.hlLinkGroupCommand('FileDiagnosticError', 'CocErrorSign'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('diagnosticError', {
  load() {
    diagnosticManager.errorReload();
  },
  draw(row, item) {
    if (Object.keys(diagnosticManager.errorPathCountStr).length > 0) {
      if (item.fullpath in diagnosticManager.errorPathCountStr) {
        row.add(
          diagnosticManager.errorPathCountStr[item.fullpath].padStart(diagnosticManager.errorMaxWidth),
          highlights.error.group,
        );
      } else {
        row.add(' '.repeat(diagnosticManager.errorMaxWidth));
      }
      row.add(' ');
    }
  },
});
