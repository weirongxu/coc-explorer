import { diagnosticManager as cocDiagnosticManager } from 'coc.nvim';

class DiagnosticManager {
  errorMaxWidth = 0;
  warningMaxWidth = 0;
  errorPathCountNum: Record<string, number> = {};
  warningPathCountNum: Record<string, number> = {};
  errorPathCountStr: Record<string, string> = {};
  warningPathCountStr: Record<string, string> = {};

  private lastReloadTime = 0;

  private reload() {
    const nowTime = Date.now();
    if (nowTime - this.lastReloadTime < 300) {
      return;
    }
    this.lastReloadTime = nowTime;

    this.errorPathCountNum = {};
    this.warningPathCountNum = {};

    cocDiagnosticManager.getDiagnosticList().forEach((diagnostic) => {
      const uri = diagnostic.location.uri;
      if (uri.startsWith('file://')) {
        const path = uri.slice(7);
        if (diagnostic.severity === 'Error') {
          if (!(path in this.errorPathCountNum)) {
            this.errorPathCountNum[path] = 0;
          }
          this.errorPathCountNum[path] += 1;
        } else {
          if (!(path in this.warningPathCountNum)) {
            this.warningPathCountNum[path] = 0;
          }
          this.warningPathCountStr[path] += 1;
        }
      }
    });
  }

  errorReload() {
    this.reload();

    const errorPathCountStr: Record<string, string> = {};
    for (const path in this.errorPathCountNum) {
      errorPathCountStr[path] = this.errorPathCountNum[path].toString();
    }
    if (JSON.stringify(errorPathCountStr) !== JSON.stringify(this.errorPathCountStr)) {
      this.errorMaxWidth = Math.max(...Object.values(errorPathCountStr).map((d) => d.length));
      this.errorPathCountStr = errorPathCountStr;
      return true;
    } else {
      return false;
    }
  }

  warningReload() {
    this.reload();

    const warningPathCountStr: Record<string, string> = {};
    for (const path in this.warningPathCountNum) {
      warningPathCountStr[path] = this.warningPathCountNum[path].toString();
    }

    if (JSON.stringify(warningPathCountStr) !== JSON.stringify(this.warningPathCountStr)) {
      this.warningMaxWidth = Math.max(...Object.values(warningPathCountStr).map((d) => d.length));
      this.warningPathCountStr = warningPathCountStr;
      return true;
    } else {
      return false;
    }
  }
}

export const diagnosticManager = new DiagnosticManager();
