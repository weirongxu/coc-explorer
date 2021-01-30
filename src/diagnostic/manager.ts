import {
  diagnosticManager as cocDiagnosticManager,
  Disposable,
  disposeAll,
  Uri,
} from 'coc.nvim';
import pathLib from 'path';
import { ExplorerSource } from '../source/source';
import { normalizePath } from '../util';
import { DiagnosticBinder } from './binder';

export type DiagnosticType = 'error' | 'warning';

class DiagnosticManager {
  /**
   * errorMixedCountCache[filepath] = count
   **/
  protected errorMixedCountCache: Record<string, number> = {};
  /**
   * warningMixedCountCache[filepath] = count
   **/
  protected warningMixedCountCache: Record<string, number> = {};
  protected binder = new DiagnosticBinder();

  /**
   * Automatically update column, when diagnostics changed
   *
   * @example
   * ```typescript
   * columnRegistrar.registerColumn(
   *   'columnType',
   *   'columnName',
   *   ({ source, subscriptions }) => {
   *     return {
   *       async init() {
   *         subscriptions.push(diagnosticManager.bindColumn(
   *           source,
   *           ['error', 'warning']
   *         ));
   *       },
   *       async draw() {
   *         ...
   *       },
   *     };
   *   },
   * );
   * ```
   */
  bindColumn(
    source: ExplorerSource<any>,
    types: DiagnosticType[] | Set<DiagnosticType>,
  ) {
    const typeSet = new Set(types);
    const disposables: Disposable[] = [];
    for (const type of typeSet) {
      disposables.push(this.binder.bind(source, type));
    }
    return Disposable.create(() => {
      disposeAll(disposables);
    });
  }

  reload(types: DiagnosticType[]) {
    const typeSet = new Set(types);

    const errorPathCount: Record<string, number> = {};
    const warningPathCount: Record<string, number> = {};

    for (const diagnostic of cocDiagnosticManager.getDiagnosticList()) {
      const uri = diagnostic.location.uri;
      const path = normalizePath(Uri.parse(uri).fsPath);
      if (diagnostic.severity === 'Error') {
        if (!(path in errorPathCount)) {
          errorPathCount[path] = 0;
        }
        errorPathCount[path] += 1;
      } else {
        if (!(path in warningPathCount)) {
          warningPathCount[path] = 0;
        }
        warningPathCount[path] += 1;
      }
    }

    if (typeSet.has('error')) {
      this.reloadMixedErrors(errorPathCount);
    }

    if (typeSet.has('warning')) {
      this.reloadMixedWarnings(warningPathCount);
    }
  }

  protected reloadMixedErrors(errorPathCount: Record<string, number>) {
    const errorMixedCount: Record<string, number> = {};

    for (const [fullpath, count] of Object.entries(errorPathCount)) {
      const parts = fullpath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = parts.slice(0, i).join(pathLib.sep);
        if (errorMixedCount[frontalPath]) {
          errorMixedCount[frontalPath] += count;
        } else {
          errorMixedCount[frontalPath] = count;
        }
      }
    }

    this.errorMixedCountCache = errorMixedCount;
  }

  protected reloadMixedWarnings(warningPathCount: Record<string, number>) {
    const warningMixedCount: Record<string, number> = {};

    for (const [fullpath, count] of Object.entries(warningPathCount)) {
      const parts = fullpath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = parts.slice(0, i).join(pathLib.sep);
        if (warningMixedCount[frontalPath]) {
          warningMixedCount[frontalPath] += count;
        } else {
          warningMixedCount[frontalPath] = count;
        }
      }
    }

    this.warningMixedCountCache = warningMixedCount;
  }

  getMixedErrors() {
    return this.errorMixedCountCache;
  }

  getMixedWarnings() {
    return this.warningMixedCountCache;
  }

  getMixedError(fullpath: string): undefined | number {
    return this.errorMixedCountCache[fullpath];
  }

  getMixedWarning(fullpath: string): undefined | number {
    return this.warningMixedCountCache[fullpath];
  }
}

export const diagnosticManager = new DiagnosticManager();
