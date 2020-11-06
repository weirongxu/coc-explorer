import {
  diagnosticManager as cocDiagnosticManager,
  Disposable,
  disposeAll,
  Uri,
} from 'coc.nvim';
import pathLib from 'path';
import { internalEvents } from './events';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { mapGetWithDefault, sum, throttle } from './util';

export type DiagnosticType = 'error' | 'warning';

class Binder {
  protected sourcesBinding: Map<
    ExplorerSource<BaseTreeNode<any>>,
    {
      refCount: {
        [key in DiagnosticType | 'total']: number;
      };
    }
  > = new Map();
  private prevErrorMixedCount: Record<string, number> = {};
  private prevWarningMixedCount: Record<string, number> = {};
  private registerDisposables: Disposable[] = [];
  registerForSourceDisposables: any;

  get sources() {
    return Array.from(this.sourcesBinding.keys());
  }

  get refTotalCount() {
    return sum(
      Array.from(this.sourcesBinding.values()).map((b) => b.refCount.total),
    );
  }

  get diagnosticTypes() {
    const types: DiagnosticType[] = [];
    const refs = Array.from(this.sourcesBinding.values()).map(
      (ref) => ref.refCount,
    );
    if (refs.some((ref) => ref.error > 0)) {
      types.push('error');
    }
    if (refs.some((ref) => ref.warning > 0)) {
      types.push('warning');
    }
    return types;
  }

  bind(source: ExplorerSource<any>, type: DiagnosticType) {
    const binding = mapGetWithDefault(this.sourcesBinding, source, () => ({
      refCount: {
        error: 0,
        warning: 0,
        total: 0,
      },
    }));
    binding.refCount[type] += 1;
    binding.refCount.total += 1;
    if (binding.refCount.total === 1) {
      this.registerForSourceDisposables = this.registerForSource(source);
    }
    if (this.refTotalCount === 1) {
      this.registerDisposables = this.register();
    }
    return Disposable.create(() => {
      binding.refCount[type] -= 1;
      binding.refCount.total -= 1;
      if (binding.refCount.total === 0) {
        disposeAll(this.registerForSourceDisposables);
        this.registerForSourceDisposables = [];
      }
      if (this.refTotalCount === 0) {
        disposeAll(this.registerDisposables);
        this.registerDisposables = [];
      }
    });
  }

  protected register() {
    return [
      internalEvents.on(
        'CocDiagnosticChange',
        throttle(100, async () => {
          await this.reload(this.sources);
        }),
      ),
    ];
  }

  protected registerForSource(source: ExplorerSource<any>) {
    return [
      source.events.on('loaded', async (node) => {
        const directory =
          'isRoot' in node
            ? source.root
            : node.expandable
            ? node.fullpath
            : node.fullpath && pathLib.dirname(node.fullpath);
        if (directory) {
          await this.reload([]);
        }
      }),
    ];
  }

  protected async reload(sources: ExplorerSource<any>[]) {
    const types = this.diagnosticTypes;
    diagnosticManager.reload(types);

    const updatePaths: Set<string> = new Set();

    if (types.includes('error')) {
      const errorMixedCount = { ...diagnosticManager.getMixedErrors() };
      const prevErrorMap = this.prevErrorMixedCount;

      for (const [fullpath, count] of Object.entries(errorMixedCount)) {
        if (fullpath in prevErrorMap) {
          if (prevErrorMap[fullpath] === count) {
            continue;
          }
          delete prevErrorMap[fullpath];
          updatePaths.add(fullpath);
        } else {
          updatePaths.add(fullpath);
        }
      }
      for (const fullpath of Object.keys(prevErrorMap)) {
        updatePaths.add(fullpath);
      }

      this.prevErrorMixedCount = errorMixedCount;
    }

    if (types.includes('warning')) {
      const warningMixedCount = { ...diagnosticManager.getMixedWarnings() };
      const prevWarningMap = this.prevWarningMixedCount;

      for (const [fullpath, count] of Object.entries(warningMixedCount)) {
        if (fullpath in prevWarningMap) {
          if (prevWarningMap[fullpath] === count) {
            continue;
          }
          delete prevWarningMap[fullpath];
          updatePaths.add(fullpath);
        } else {
          updatePaths.add(fullpath);
        }
      }
      for (const fullpath of Object.keys(prevWarningMap)) {
        updatePaths.add(fullpath);
      }

      this.prevWarningMixedCount = warningMixedCount;
    }

    for (const source of sources) {
      await source.renderPaths(updatePaths);
    }
  }
}

class DiagnosticManager {
  /**
   * errorMixedCountCache[filepath] = count
   **/
  protected errorMixedCountCache: Record<string, number> = {};
  /**
   * warningMixedCountCache[filepath] = count
   **/
  protected warningMixedCountCache: Record<string, number> = {};
  protected binder = new Binder();

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
      const path = Uri.parse(uri).fsPath;
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
