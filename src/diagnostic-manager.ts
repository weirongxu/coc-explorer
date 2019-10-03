import { diagnosticManager as cocDiagnosticManager } from 'coc.nvim';
import pathLib from 'path';

class DiagnosticManager {
  errorNeedRender = false;
  warningNeedRender = false;
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
      if (uri.startsWith('file://')) {
        const path = uri.slice(7);
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
      }
    });

    if (JSON.stringify(errorPathCountNum) !== JSON.stringify(this.errorPathCount)) {
      this.errorPathCount = errorPathCountNum;
      this.errorNeedRender = true;
    }

    if (JSON.stringify(warningPathCountNum) !== JSON.stringify(this.warningPathCount)) {
      this.warningPathCount = warningPathCountNum;
      this.warningNeedRender = true;
    }
  }

  errorReload(root: string) {
    this.reload();

    if (this.errorNeedRender) {
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
  }

  warningReload(root: string) {
    this.reload();

    if (this.warningNeedRender) {
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
}

export const diagnosticManager = new DiagnosticManager();
