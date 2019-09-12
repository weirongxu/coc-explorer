import { diagnosticManager } from 'coc.nvim';
import { throttle } from 'throttle-debounce';

class DiagnosticUI {
  maxErrorWidth = 0;
  maxWarningWidth = 0;
  errorMap: Record<string, string> = {};
  warningMap: Record<string, string> = {};
  reload: throttle<() => void>;

  constructor() {
    this.reload = throttle(100, this._reload);
  }

  _reload() {
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

    this.errorMap = {};
    this.warningMap = {};
    for (const path in errorMapCount) {
      this.errorMap[path] = errorMapCount[path].toString();
    }
    for (const path in warningMapCount) {
      this.warningMap[path] = warningMapCount[path].toString();
    }
    this.maxErrorWidth = Math.max(...Object.values(this.errorMap).map((d) => d.length));
    this.maxWarningWidth = Math.max(...Object.values(this.warningMap).map((d) => d.length));
  }
}

export const diagnosticUI = new DiagnosticUI();
