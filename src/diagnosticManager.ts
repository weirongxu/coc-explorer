import { Uri, diagnosticManager as cocDiagnosticManager } from 'coc.nvim';
import pathLib from 'path';

class DiagnosticManager {
  errorPathCount: Record<string, number> = {};
  warningPathCount: Record<string, number> = {};
  errorMixedCount: Record<string, number> = {};
  warningMixedCount: Record<string, number> = {};

  private lastReloadTime = 0;

  private reload() {
    const nowTime = Date.now();
    if (nowTime - this.lastReloadTime < 300) {
      return;
    }
    this.lastReloadTime = nowTime;

    const errorPathCountNum: Record<string, number> = {};
    const warningPathCountNum: Record<string, number> = {};

    cocDiagnosticManager.getDiagnosticList().forEach((diagnostic) => {
      const uri = diagnostic.location.uri;
      const path = Uri.parse(uri).fsPath;
      if (diagnostic.severity === 'Error') {
        if (!(path in errorPathCountNum)) {
          errorPathCountNum[path] = 0;
        }
        errorPathCountNum[path] += 1;
      } else {
        if (!(path in warningPathCountNum)) {
          warningPathCountNum[path] = 0;
        }
        warningPathCountNum[path] += 1;
      }
    });

    this.errorPathCount = errorPathCountNum;

    this.warningPathCount = warningPathCountNum;
  }

  errorReload(root: string) {
    this.reload();

    this.errorMixedCount = {};

    Object.entries(this.errorPathCount).forEach(([fullpath, count]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
        if (this.errorMixedCount[frontalPath]) {
          this.errorMixedCount[frontalPath] += count;
        } else {
          this.errorMixedCount[frontalPath] = count;
        }
      }
    });
  }

  warningReload(root: string) {
    this.reload();

    this.warningMixedCount = {};

    Object.entries(this.warningPathCount).forEach(([fullpath, count]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
        if (this.warningMixedCount[frontalPath]) {
          this.warningMixedCount[frontalPath] += count;
        } else {
          this.warningMixedCount[frontalPath] = count;
        }
      }
    });
  }
}

export const diagnosticManager = new DiagnosticManager();
