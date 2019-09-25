import { diagnosticManager as cocDiagnosticManager } from 'coc.nvim';
import pathLib from 'path';
import { config } from './util';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;

class DiagnosticManager {
  errorMaxWidth = 0;
  warningMaxWidth = 0;
  errorNeedRender = false;
  warningNeedRender = false;
  errorPathCount: Record<string, number> = {};
  warningPathCount: Record<string, number> = {};
  errorMixedCount: Record<string, string> = {};
  warningMixedCount: Record<string, string> = {};

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
      const errorMixedCount: Record<string, number> = {};

      Object.entries(this.errorPathCount).forEach(([fullpath, count]) => {
        const relativePath = pathLib.relative(root, fullpath);
        const parts = relativePath.split(pathLib.sep);

        for (let i = 1; i <= parts.length; i++) {
          const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
          const cache = errorMixedCount[frontalPath];
          if (cache) {
            errorMixedCount[frontalPath] += count;
          } else {
            errorMixedCount[frontalPath] = count;
          }
        }
      });

      this.errorMixedCount = {};
      Object.entries(errorMixedCount).forEach(([fullpath, count]) => {
        if (count > diagnosticCountMax) {
          this.errorMixedCount[fullpath] = '●';
        } else {
          this.errorMixedCount[fullpath] = count.toString();
        }
      });
      this.errorMaxWidth = Math.max(...Object.values(this.errorMixedCount).map((d) => d.length));
    }
  }

  warningReload(root: string) {
    this.reload();

    if (this.warningNeedRender) {
      const warningMixedCount: Record<string, number> = {};

      Object.entries(this.warningPathCount).forEach(([fullpath, count]) => {
        const relativePath = pathLib.relative(root, fullpath);
        const parts = relativePath.split(pathLib.sep);

        for (let i = 1; i <= parts.length; i++) {
          const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
          const cache = warningMixedCount[frontalPath];
          if (cache) {
            warningMixedCount[frontalPath] += count;
          } else {
            warningMixedCount[frontalPath] = count;
          }
        }
      });

      this.warningMixedCount = {};
      Object.entries(warningMixedCount).forEach(([fullpath, count]) => {
        if (count > diagnosticCountMax) {
          this.warningMixedCount[fullpath] = '●';
        } else {
          this.warningMixedCount[fullpath] = count.toString();
        }
      });
      this.warningMaxWidth = Math.max(...Object.values(this.warningMixedCount).map((d) => d.length));
    }
  }
}

export const diagnosticManager = new DiagnosticManager();
