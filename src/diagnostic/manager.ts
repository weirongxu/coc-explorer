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
  protected errorMixedCountCache: Map<string, number> = new Map();
  /**
   * warningMixedCountCache[filepath] = count
   **/
  protected warningMixedCountCache: Map<string, number> = new Map();
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

  async reload(types: DiagnosticType[]) {
    const typeSet = new Set(types);

    const errorPathCount = new Map<string, number>();
    const warningPathCount = new Map<string, number>();

    // eslint-disable-next-line @typescript-eslint/await-thenable
    for (const diagnostic of await cocDiagnosticManager.getDiagnosticList()) {
      const uri = diagnostic.location.uri;
      const path = normalizePath(Uri.parse(uri).fsPath);
      if (diagnostic.severity === 'Error') {
        const count = errorPathCount.get(path);
        errorPathCount.set(path, (count ?? 0) + 1);
      } else {
        const count = warningPathCount.get(path);
        warningPathCount.set(path, (count ?? 0) + 1);
      }
    }

    if (typeSet.has('error')) {
      this.reloadMixedErrors(errorPathCount);
    }

    if (typeSet.has('warning')) {
      this.reloadMixedWarnings(warningPathCount);
    }
  }

  protected reloadMixedErrors(errorPathCount: Map<string, number>) {
    const errorMixedCount = new Map<string, number>();

    for (const [fullpath, count] of errorPathCount) {
      const parts = fullpath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = parts.slice(0, i).join(pathLib.sep);
        const existCount = errorMixedCount.get(frontalPath);
        errorMixedCount.set(frontalPath, (existCount ?? 0) + count);
      }
    }

    this.errorMixedCountCache = errorMixedCount;
  }

  protected reloadMixedWarnings(warningPathCount: Map<string, number>) {
    const warningMixedCount = new Map<string, number>();

    for (const [fullpath, count] of warningPathCount) {
      const parts = fullpath.split(pathLib.sep);

      for (let i = 1; i <= parts.length; i++) {
        const frontalPath = parts.slice(0, i).join(pathLib.sep);
        const existCount = warningMixedCount.get(frontalPath);
        warningMixedCount.set(frontalPath, (existCount ?? 0) + count);
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
    return this.errorMixedCountCache.get(fullpath);
  }

  getMixedWarning(fullpath: string): undefined | number {
    return this.warningMixedCountCache.get(fullpath);
  }
}

export const diagnosticManager = new DiagnosticManager();
