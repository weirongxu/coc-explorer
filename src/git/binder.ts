import { Disposable, disposeAll, workspace } from 'coc.nvim';
import pathLib from 'path';
import { config } from '../config';
import { internalEvents, onEvent } from '../events';
import { ExplorerManager } from '../explorerManager';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import {
  Cancelled,
  debounce,
  debouncePromise,
  mapGetWithDefault,
  onError,
  sum,
} from '../util';
import { GitCommand } from './command';
import { gitManager } from './manager';
import { GitMixedStatus, GitRootStatus } from './types';

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
  private showIgnored: boolean;
  private showUntrackedFiles: GitCommand.ShowUntrackedFiles;
  /**
   * prevStatuses[root][path] = GitMixedStatus
   */
  private prevStatuses: Record<string, Record<string, GitMixedStatus>> = {};
  /**
   * prevStatuses[root] = GitRootStatus
   */
  private prevRootStatus: Record<string, GitRootStatus> = {};
  private registerForSourceDisposables: Disposable[] = [];
  private registerDisposables: Disposable[] = [];
  private inited = false;

  explorerManager_?: ExplorerManager;
  get explorerManager() {
    if (!this.explorerManager_) {
      throw new Error('explorerManager not initialized yet');
    }
    return this.explorerManager_;
  }

  get sources() {
    return Array.from(this.sourcesBinding.keys());
  }

  get refTotalCount() {
    return sum(Array.from(this.sourcesBinding.values()).map((b) => b.refCount));
  }

  constructor() {
    const deprecatedShowIgnored = config.get<boolean>(
      'file.column.git.showIgnored',
    );
    if (deprecatedShowIgnored !== undefined) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        'explorer.file.column.git.showIgnored has been deprecated, please use explorer.git.showIgnored in coc-settings.json',
        'warning',
      );
      this.showIgnored = deprecatedShowIgnored;
    } else {
      this.showIgnored = config.get<boolean>('git.showIgnored')!;
    }

    this.showUntrackedFiles = config.get<GitCommand.ShowUntrackedFiles>(
      'file.git.showUntrackedFiles',
    )!;
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
        internalEvents.on(event, () =>
          this.reloadDebounce(this.sources, workspace.cwd, false),
        ),
      ),
      onEvent(
        'BufWritePost',
        debounce(1000, async (bufnr) => {
          const fullpath = this.explorerManager.bufManager.getBufferNode(bufnr)
            ?.fullpath;
          if (fullpath) {
            const filename = pathLib.basename(fullpath);
            const dirname = pathLib.dirname(fullpath);
            const isReloadAll = filename === '.gitignore';
            await this.reloadDebounce(this.sources, dirname, isReloadAll);
          }
        }),
      ),
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
          this.reloadDebounce([source], directory, true).catch(onError);
        }
      }),
    ];
  }

  private reloadDebounceChecker = debouncePromise(1000, () => {});
  private reloadDebounceArgs = {
    sources: new Set<ExplorerSource<any>>(),
    directories: new Set<string>(),
    isReloadAll: false,
  };

  async reloadDebounce(
    sources: ExplorerSource<any>[],
    directory: string,
    isReloadAll: boolean,
  ) {
    sources.forEach((s) => {
      this.reloadDebounceArgs.sources.add(s);
    });
    this.reloadDebounceArgs.directories.add(directory);
    if (isReloadAll) {
      this.reloadDebounceArgs.isReloadAll = true;
    }
    const r = await this.reloadDebounceChecker();
    if (r instanceof Cancelled) {
      return;
    }
    const updatePaths = await this.reload(
      [...this.reloadDebounceArgs.sources],
      [...this.reloadDebounceArgs.directories],
      this.reloadDebounceArgs.isReloadAll,
    );
    this.reloadDebounceArgs.sources.clear();
    this.reloadDebounceArgs.directories.clear();
    this.reloadDebounceArgs.isReloadAll = false;
    return updatePaths;
  }

  async reload(
    sources: ExplorerSource<any>[],
    directories: string[],
    isReloadAll: boolean,
  ) {
    const roots = await gitManager.getGitRoots(directories);

    if (!roots.length) {
      return;
    }

    const updatePaths: Set<string> = new Set();

    for (const root of roots) {
      await gitManager.reload(root, {
        showIgnored: this.showIgnored,
        showUntrackedFiles: this.showUntrackedFiles,
      });

      // render paths
      const statuses = await gitManager.getRootMixedStatuses(root);
      const rootStatus = gitManager.getRootStatus(root) || {
        allStaged: false,
        formats: [],
      };
      if (!(root in this.prevStatuses)) {
        this.prevStatuses[root] = {};
      }
      if (!(root in this.prevRootStatus)) {
        this.prevRootStatus[root] = {
          allStaged: false,
          formats: [],
        };
      }

      if (isReloadAll) {
        for (const fullpath of Object.keys(statuses)) {
          updatePaths.add(fullpath);
        }
        for (const fullpath of Object.keys(this.prevStatuses)) {
          updatePaths.add(fullpath);
        }

        updatePaths.add(root);
      } else {
        for (const [fullpath, status] of Object.entries(statuses)) {
          if (fullpath in this.prevStatuses[root]) {
            if (statusEqual(this.prevStatuses[root][fullpath], status)) {
              continue;
            }
            delete this.prevStatuses[fullpath];
          }
          updatePaths.add(fullpath);
        }
        for (const fullpath of Object.keys(this.prevStatuses)) {
          updatePaths.add(fullpath);
        }

        if (
          rootStatus &&
          (!this.prevRootStatus ||
            !rootStatusEqual(this.prevRootStatus[root], rootStatus))
        ) {
          updatePaths.add(root);
        }
      }

      for (const source of sources) {
        await source.view.renderPaths(updatePaths);
      }

      this.prevStatuses[root] = statuses;
      this.prevRootStatus[root] = rootStatus;
      return updatePaths;
    }
  }
}
