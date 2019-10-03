import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config } from '../../../../util';
import { expandStore } from '../file-source';

const highlights = {
  warning: hlGroupManager.hlLinkGroupCommand('FileDiagnosticWarning', 'CocWarningSign'),
};
hlGroupManager.register(highlights);

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
let warningMixedCountStr: Record<string, string> = {};
let warningMaxWidth = 0;

fileColumnManager.registerColumn('diagnosticWarning', (fileSource) => ({
  load() {
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
    warningMaxWidth = Math.max(...Object.values(warningMixedCountStr).map((d) => d.length));
  },
  draw(row, item) {
    if (Object.keys(warningMixedCountStr).length > 0) {
      if (item.fullpath in warningMixedCountStr) {
        if (item.directory && expandStore.isExpanded(item.fullpath)) {
          row.add(' '.padStart(warningMaxWidth), highlights.warning);
        } else {
          const count = warningMixedCountStr[item.fullpath];
          row.add(count.toString().padStart(warningMaxWidth), highlights.warning);
          fileSource.diagnosisLineIndexes.push(row.line);
        }
      } else {
        row.add(' '.repeat(warningMaxWidth));
      }
      row.add(' ');
    }
  },
}));
