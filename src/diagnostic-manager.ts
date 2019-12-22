import { Uri, diagnosticManager as cocDiagnosticManager } from 'coc.nvim';
import pathLib from 'path';
import { config } from './util';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;

class DiagnosticManager {
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

    const errorMixedCount: Record<string, number> = {};

    Object.entries(this.errorPathCount).forEach(([fullpath, count]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
        if (errorMixedCount[frontalPath]) {
          errorMixedCount[frontalPath] += count;
        } else {
          errorMixedCount[frontalPath] = count;
        }
      }
    });

    this.errorMixedCount = Object.entries(errorMixedCount).reduce((mixed, [fullpath, count]) => {
      if (count > diagnosticCountMax) {
        mixed[fullpath] = '●';
      } else {
        mixed[fullpath] = count.toString();
      }
      return mixed;
    }, {} as Record<string, string>);
  }

  warningReload(root: string) {
    this.reload();

    const warningMixedCount: Record<string, number> = {};

    Object.entries(this.warningPathCount).forEach(([fullpath, count]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
        if (warningMixedCount[frontalPath]) {
          warningMixedCount[frontalPath] += count;
        } else {
          warningMixedCount[frontalPath] = count;
        }
      }
    });

    this.warningMixedCount = Object.entries(warningMixedCount).reduce(
      (mixed, [fullpath, count]) => {
        if (count > diagnosticCountMax) {
          mixed[fullpath] = '●';
        } else {
          mixed[fullpath] = count.toString();
        }
        return mixed;
      },
      {} as Record<string, string>,
    );
  }
}

export const diagnosticManager = new DiagnosticManager();
