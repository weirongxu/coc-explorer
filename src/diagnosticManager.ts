import {
  Uri,
  diagnosticManager as cocDiagnosticManager,
  Emitter,
  ExtensionContext,
} from 'coc.nvim';
import pathLib from 'path';
import { internalEvents } from './events';
import { throttle } from './util';

export class DiagnosticManager {
  errorPathCount: Record<string, number> = {};
  warningPathCount: Record<string, number> = {};

  onChange = (fn: () => void) => this.onChangeEvent.event(fn);

  private onChangeEvent = new Emitter<void>();

  constructor(context: ExtensionContext) {
    context.subscriptions.push(
      internalEvents.on(
        'CocDiagnosticChange',
        throttle(100, () => {
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

          this.onChangeEvent.fire();
        }),
      ),
    );
  }

  getMixedErrorsAndWarns(root: string): [Set<string>, Set<string>] {
    const errorPaths: Set<string> = new Set();
    const warningPaths: Set<string> = new Set();

    // Get the errors
    Object.entries(this.errorPathCount).forEach(([fullpath, _]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(
          root,
          parts.slice(0, i).join(pathLib.sep),
        );
        errorPaths.add(frontalPath);
      }
    });

    // Get the warnings
    Object.entries(this.warningPathCount).forEach(([fullpath, _]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(
          root,
          parts.slice(0, i).join(pathLib.sep),
        );
        warningPaths.add(frontalPath);
      }
    });

    return [errorPaths, warningPaths];
  }

  getMixedError(root: string) {
    const errorMixedCount: Record<string, number> = {};

    Object.entries(this.errorPathCount).forEach(([fullpath, count]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(
          root,
          parts.slice(0, i).join(pathLib.sep),
        );
        if (errorMixedCount[frontalPath]) {
          errorMixedCount[frontalPath] += count;
        } else {
          errorMixedCount[frontalPath] = count;
        }
      }
    });

    return errorMixedCount;
  }

  getMixedWarning(root: string) {
    const warningMixedCount: Record<string, number> = {};

    Object.entries(this.warningPathCount).forEach(([fullpath, count]) => {
      const relativePath = pathLib.relative(root, fullpath);
      const parts = relativePath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = pathLib.join(
          root,
          parts.slice(0, i).join(pathLib.sep),
        );
        if (warningMixedCount[frontalPath]) {
          warningMixedCount[frontalPath] += count;
        } else {
          warningMixedCount[frontalPath] = count;
        }
      }
    });

    return warningMixedCount;
  }
}
