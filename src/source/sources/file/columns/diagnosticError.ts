import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, max } from '../../../../util';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
let errorMixedCountStr: Record<string, string> = {};
let errorMaxWidth = 0;

const highlights = {
  error: hlGroupManager.hlLinkGroupCommand('FileDiagnosticError', 'CocErrorSign'),
};

fileColumnManager.registerColumn('diagnosticError', (fileSource) => ({
  load() {
    diagnosticManager.errorReload(fileSource.root);
  },
  beforeDraw() {
    fileSource.diagnosisLineIndexes = [];

    errorMixedCountStr = {};
    Object.entries(diagnosticManager.errorMixedCount).forEach(([fullpath, count]) => {
      if (count > diagnosticCountMax) {
        errorMixedCountStr[fullpath] = '●';
      } else {
        errorMixedCountStr[fullpath] = count.toString();
      }
    });
    errorMaxWidth = max(Object.values(errorMixedCountStr).map((d) => d.length));
  },
  draw(row, node) {
    if (Object.keys(diagnosticManager.errorMixedCount).length > 0) {
      if (node.fullpath in diagnosticManager.errorMixedCount) {
        if (node.directory && fileSource.expandStore.isExpanded(node)) {
          row.add(' '.padStart(errorMaxWidth), highlights.error);
        } else {
          const count = errorMixedCountStr[node.fullpath];
          row.add(count.padStart(errorMaxWidth), highlights.error);
          fileSource.diagnosisLineIndexes.push(row.line);
        }
      } else {
        row.add(' '.repeat(errorMaxWidth));
      }
      row.add(' ');
    }
  },
}));
