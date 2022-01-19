import { Disposable, disposeAll, workspace } from 'coc.nvim';
import pathLib from 'path';
import { buffer, debounceTime, switchMap } from 'rxjs';
import { internalEvents, onEvent } from '../events';
import { ExplorerManager } from '../explorerManager';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { createSubject, mapGetWithDefault, sum } from '../util';
import { gitManager } from './manager';
import { GitIgnore, GitMixedStatus, GitRootStatus } from './types';

const statusEqual = (a: GitMixedStatus, b: GitMixedStatus) => {
  return a.x === b.x && a.y === b.y;
};

const rootStatusEqual = (a: GitRootStatus, b: GitRootStatus) => {
  if (a.allStaged !== b.allStaged) {
    return false;
  }
  return a.formats.join(',') === b.formats.join(',');
};

export class GitBinder {
  protected sourcesBinding: Map<
    ExplorerSource<BaseTreeNode<any>>,
    { refCount: number }
  > = new Map();
  /**
   * prevStatusesMapInRoot[root][path] = GitMixedStatus
   */
  private prevStatusesMapInRoot = new Map<
    string,
    Map<string, GitMixedStatus>
  >();
  /**
   * prevIgnoresMapInRoot[root][path] = GitRootStatus
   */
  private prevIgnoresMapInRoot = new Map<string, Map<string, GitIgnore>>();
  /**
   * prevRootStatuses[root] = GitRootStatus
   */
  private prevRootStatuses = new Map<string, GitRootStatus>();
  private registerForSourceDisposables: Disposable[] = [];
  private registerDisposables: Disposable[] = [];
  private inited = false;

  explorerManager_?: ExplorerManager;
  get explorerManager() {
    if (!this.explorerManager_) {
      throw new Error('ExplorerSource(explorerManager) is not bound yet');
    }
    return this.explorerManager_;
  }

  get sources() {
    return Array.from(this.sourcesBinding.keys());
  }

  get refTotalCount() {
    return sum(Array.from(this.sourcesBinding.values()).map((b) => b.refCount));
  }

  protected init_(source: ExplorerSource<BaseTreeNode<any>>) {
    if (!this.inited) {
      this.inited = true;
      this.explorerManager_ = source.explorer.explorerManager;
    }
  }

  bind(source: ExplorerSource<BaseTreeNode<any>>) {
    this.init_(source);
    const binding = mapGetWithDefault(this.sourcesBinding, source, () => ({
      refCount: 0,
    }));
    binding.refCount += 1;
    if (binding.refCount === 1) {
      this.registerForSourceDisposables = this.registerForSource(source);
    }
    if (this.refTotalCount === 1) {
      this.registerDisposables = this.register();
    }
    return Disposable.create(() => {
      binding.refCount -= 1;
      if (binding.refCount === 0) {
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
      ...(['CocGitStatusChange', 'FugitiveChanged'] as const).map((event) =>
        internalEvents.on(event, async () => {
          this.reloadDebounceSubject.next({
            sources: this.sources,
            directory: workspace.cwd,
          });
        }),
      ),
      onEvent('BufWritePost', async (bufnr) => {
        const fullpath =
          this.explorerManager.bufManager.getBufferNode(bufnr)?.fullpath;
        if (fullpath) {
          const dirname = pathLib.dirname(fullpath);
          this.reloadDebounceSubject.next({
            sources: this.sources,
            directory: dirname,
          });
        }
      }),
    ];
  }

  protected registerForSource(
    source: ExplorerSource<BaseTreeNode<any, string>>,
  ) {
    return [
      source.events.on('loaded', async (node) => {
        const directory =
          'isRoot' in node
            ? source.root
            : node.expandable
            ? node.fullpath
            : node.fullpath && pathLib.dirname(node.fullpath);
        if (directory) {
          this.reloadDebounceSubject.next({ sources: [source], directory });
        }
      }),
    ];
  }

  protected reloadDebounceSubject = createSubject<{
    sources: ExplorerSource<any>[];
    directory: string;
  }>((sub) =>
    sub.pipe(
      buffer(sub.pipe(debounceTime(200))),
      switchMap(async (list) => {
        const sources = new Set(list.map((it) => it.sources).flat());
        const directories = new Set(list.map((it) => it.directory));
        await this.reload([...sources], [...directories]);
      }),
    ),
  );

  protected async reload(
    sources: ExplorerSource<any>[],
    directories: string[],
  ) {
    const roots = await gitManager.getGitRoots(directories);

    if (!roots.length) {
      return;
    }

    const updatePaths: Set<string> = new Set();
    const updateDirs: Set<string> = new Set();

    for (const root of roots) {
      await gitManager.reload(root);

      // render paths
      const statuses = gitManager.getMixedStatusesByRoot(root);
      const ignores = gitManager.getIgnoreByRoot(root);
      const rootStatus = gitManager.getRootStatus(root) || {
        allStaged: false,
        formats: [],
      };
      let prevStatusMap = this.prevStatusesMapInRoot.get(root);
      if (!prevStatusMap) {
        prevStatusMap = new Map();
        this.prevStatusesMapInRoot.set(root, prevStatusMap);
      }
      let prevIgnoreMap = this.prevIgnoresMapInRoot.get(root);
      if (!prevIgnoreMap) {
        prevIgnoreMap = new Map();
        this.prevIgnoresMapInRoot.set(root, prevIgnoreMap);
      }
      let prevRootStatus = this.prevRootStatuses.get(root);
      if (!prevRootStatus) {
        prevRootStatus = {
          allStaged: false,
          formats: [],
        };
        this.prevRootStatuses.set(root, prevRootStatus);
      }
      const addGitIgnore = (fullpath: string, gitIgnore: GitIgnore) => {
        if (gitIgnore === GitIgnore.directory) {
          updateDirs.add(fullpath.replace(/[\\/]$/, ''));
        } else {
          updatePaths.add(fullpath);
        }
      };

      for (const [fullpath, status] of statuses) {
        const prevStatus = prevStatusMap.get(fullpath);
        if (prevStatus) {
          if (statusEqual(prevStatus, status)) {
            prevStatusMap.delete(fullpath);
            continue;
          }
        }
        updatePaths.add(fullpath);
      }
      for (const fullpath of prevStatusMap.keys()) {
        updatePaths.add(fullpath);
      }

      // ignore
      for (const [fullpath, gitIgnore] of ignores) {
        const prevIgnore = prevIgnoreMap.get(fullpath);
        if (prevIgnore === gitIgnore) {
          prevIgnoreMap.delete(fullpath);
          continue;
        }
        addGitIgnore(fullpath, gitIgnore);
      }
      for (const [fullpath, gitIgnore] of prevIgnoreMap) {
        addGitIgnore(fullpath, gitIgnore);
      }

      // root
      if (rootStatus && !rootStatusEqual(prevRootStatus, rootStatus)) {
        updatePaths.add(root);
      }

      this.prevStatusesMapInRoot.set(root, statuses);
      this.prevIgnoresMapInRoot.set(root, ignores);
      this.prevRootStatuses.set(root, rootStatus);
    }

    for (const source of sources) {
      await source.view.renderPaths([
        ...updatePaths,
        {
          paths: updateDirs,
          withChildren: true,
        },
      ]);
    }
  }
}
