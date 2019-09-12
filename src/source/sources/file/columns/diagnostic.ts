import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from 'coc.nvim';

const highlights = {
  error: hlGroupManager.hlLinkGroupCommand('FileDiagnosticError', 'CocErrorSign'),
  warning: hlGroupManager.hlLinkGroupCommand('FileDiagnosticWarning', 'CocWarningSign'),
};
hlGroupManager.register(highlights);

let errorMap: Record<string, string> = {};
let warningMap: Record<string, string> = {};
let maxErrorWidth = 0;
let maxWarningWidth = 0;

fileColumnManager.registerColumn('diagnostic', {
  beforeDraw() {
    // initialize diagnosticMapCount
    const errorMapCount: Record<string, number> = {};
    const warningMapCount: Record<string, number> = {};
    diagnosticManager.getDiagnosticList().forEach((diagnostic) => {
      const uri = diagnostic.location.uri;
      if (uri.startsWith('file://')) {
        const path = uri.slice(7);
        if (diagnostic.severity === 'Error') {
          if (!(path in errorMapCount)) {
            errorMapCount[path] = 0;
          }
          errorMapCount[path] += 1;
        } else {
          if (!(path in warningMapCount)) {
            warningMapCount[path] = 0;
          }
          warningMapCount[path] += 1;
        }
      }
    });

    errorMap = {};
    warningMap = {};
    for (const path in errorMapCount) {
      errorMap[path] = errorMapCount[path].toString();
    }
    for (const path in warningMapCount) {
      warningMap[path] = warningMapCount[path].toString();
    }
    maxErrorWidth = Math.max(...Object.values(errorMap).map((d) => d.length));
    maxWarningWidth = Math.max(...Object.values(warningMap).map((d) => d.length));
  },
  draw(row, item) {
    if (Object.keys(errorMap).length > 0) {
      if (item.fullpath in errorMap) {
        row.add(errorMap[item.fullpath].padStart(maxErrorWidth), highlights.error.group);
      } else {
        row.add(' '.repeat(maxErrorWidth));
      }
      row.add(' ');
    }
    if (Object.keys(warningMap).length > 0) {
      if (item.fullpath in warningMap) {
        row.add(warningMap[item.fullpath].padStart(maxErrorWidth), highlights.warning.group);
      } else {
        row.add(' '.repeat(maxWarningWidth));
      }
      row.add(' ');
    }
  },
});
