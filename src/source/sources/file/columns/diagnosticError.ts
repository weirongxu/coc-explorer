import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';

const highlights = {
  error: hlGroupManager.hlLinkGroupCommand('FileDiagnosticError', 'CocErrorSign'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('diagnosticError', (fileSource) => ({
  load() {
    diagnosticManager.errorReload(fileSource.root);
  },
  beforeDraw() {
    fileSource.diagnosisLineIndexes = [];
  },
  draw(row, item) {
    if (Object.keys(diagnosticManager.errorMixedCount).length > 0) {
      if (item.fullpath in diagnosticManager.errorMixedCount) {
        row.add(
          diagnosticManager.errorMixedCount[item.fullpath].toString().padStart(diagnosticManager.errorMaxWidth),
          highlights.error,
        );
        fileSource.diagnosisLineIndexes.push(row.line);
      } else {
        row.add(' '.repeat(diagnosticManager.errorMaxWidth));
      }
      row.add(' ');
    }
  },
}));
