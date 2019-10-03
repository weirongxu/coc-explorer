import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { expandStore } from '../file-source';
import { config } from '../../../../util';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
let errorMixedCountStr: Record<string, string> = {};
let errorMaxWidth = 0;

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

    errorMixedCountStr = {};
    Object.entries(diagnosticManager.errorMixedCount).forEach(([fullpath, count]) => {
      if (count > diagnosticCountMax) {
        errorMixedCountStr[fullpath] = '●';
      } else {
        errorMixedCountStr[fullpath] = count.toString();
      }
    });
    errorMaxWidth = Math.max(...Object.values(errorMixedCountStr).map((d) => d.length));
  },
  draw(row, item) {
    if (Object.keys(diagnosticManager.errorMixedCount).length > 0) {
      if (item.fullpath in diagnosticManager.errorMixedCount) {
        if (item.directory && expandStore.isExpanded(item.fullpath)) {
          row.add(' '.padStart(errorMaxWidth), highlights.error);
        } else {
          const count = errorMixedCountStr[item.fullpath];
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
