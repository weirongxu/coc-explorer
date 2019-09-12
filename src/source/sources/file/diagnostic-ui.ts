import { diagnosticManager } from 'coc.nvim';
import { throttle } from 'throttle-debounce';

class DiagnosticUI {
  maxErrorWidth = 0;
  maxWarningWidth = 0;
  errorMap: Record<string, string> = {};
  warningMap: Record<string, string> = {};
  reload: throttle<() => void>;
  errorNeedRedraw: boolean = false;
  warningNeedRedraw: boolean = false;

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

    const errorMap: Record<string, string> = {};
    const warningMap: Record<string, string> = {};
    for (const path in errorMapCount) {
      errorMap[path] = errorMapCount[path].toString();
    }
    for (const path in warningMapCount) {
      warningMap[path] = warningMapCount[path].toString();
    }

    if (JSON.stringify(errorMap) !== JSON.stringify(this.errorMap)) {
      this.maxErrorWidth = Math.max(...Object.values(errorMap).map((d) => d.length));
      this.errorMap = errorMap;
      this.errorNeedRedraw = true;
    }
    if (JSON.stringify(warningMap) !== JSON.stringify(this.warningMap)) {
      this.maxWarningWidth = Math.max(...Object.values(warningMap).map((d) => d.length));
      this.warningMap = warningMap;
      this.warningNeedRedraw = true;
    }
  }
}

export const diagnosticUI = new DiagnosticUI();
