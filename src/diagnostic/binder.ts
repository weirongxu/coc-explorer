import { Disposable, disposeAll } from 'coc.nvim';
import { internalEvents } from '../events';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { mapGetWithDefault, sum, throttle } from '../util';
import { diagnosticManager, DiagnosticType } from './manager';
import pathLib from 'path';

export class DiagnosticBinder {
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
      await source.view.renderPaths(updatePaths);
    }
  }
}
