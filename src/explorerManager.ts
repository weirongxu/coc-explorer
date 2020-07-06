import {
  Disposable,
  disposeAll,
  Emitter,
  ExtensionContext,
  workspace,
} from 'coc.nvim';
import { argOptions } from './argOptions';
import { BufManager } from './bufManager';
import { buildExplorerConfig, configLocal } from './config';
import { GlobalContextVars } from './contextVariables';
import { DiagnosticManager } from './diagnosticManager';
import { onBufEnter } from './events';
import { Explorer } from './explorer';
import { onError } from './logger';
import { getMappings } from './mappings';
import { Args } from './parseArgs';
import { compactI, supportedNvimFloating } from './util';

export type TabContainer = {
  left: Explorer[];
  right: Explorer[];
  tab: Explorer[];
  floating: Explorer[];
};

export class ExplorerManager {
  bufferName = '[coc-explorer]';
  filetype = 'coc-explorer';
  emitterDidAutoload = new Emitter<void>();
  previousBufnr = new GlobalContextVars<number>('previousBufnr');
  previousWindowID = new GlobalContextVars<number>('previousWindowID');
  maxExplorerID = 0;
  tabContainer: Record<number, TabContainer> = {};
  rootPathRecords: Set<string> = new Set();
  nvim = workspace.nvim;
  bufManager: BufManager;
  diagnosticManager: DiagnosticManager;

  /**
   * mappings[key][mode] = '<Plug>(coc-action-mode-key)'
   */
  private mappings: Record<string, Record<string, string>> = {};
  private registeredMapping: boolean = false;
  private onRegisteredMapping = new Emitter<void>();
  private initedState = {
    initedCount: 0,
    list: ['onRegisteredMapping', 'emitterDidAutoload'] as const,
  };
  private onInited = new Emitter<void>();

  constructor(public context: ExtensionContext) {
    this.initedState.list.forEach((method) => {
      this[method].event(() => {
        this.initedState.initedCount += 1;
        if (this.initedState.initedCount >= this.initedState.list.length) {
          this.onInited.fire();
        }
      });
    });

    this.emitterDidAutoload.event(() => {
      this.registerMappings().catch(onError);
    });

    this.updatePrevCtxVars(workspace.bufnr).catch(onError);
    this.context.subscriptions.push(
      onBufEnter(async (bufnr) => {
        await this.updatePrevCtxVars(bufnr);
      }, 0),
    );

    this.context.subscriptions.push(
      Disposable.create(() => disposeAll(this.explorers())),
    );

    this.bufManager = new BufManager(this.context);
    this.diagnosticManager = new DiagnosticManager(this.context);
  }

  async currentTabId() {
    return (await this.nvim.call('coc_explorer#tab_id')) as number;
  }

  async currentTabIdMax() {
    return (await this.nvim.call('coc_explorer#tab_id_max')) as number;
  }

  async currentTabContainer(): Promise<undefined | TabContainer> {
    return this.tabContainer[await this.currentTabId()];
  }

  private async updatePrevCtxVars(bufnr: number) {
    if (!this.bufnrs().includes(bufnr)) {
      const filetype = await this.nvim.getVar('&filetype');
      if (filetype !== this.filetype) {
        await this.previousBufnr.set(bufnr);
        const winid = (await this.nvim.call('win_getid')) as number;
        await this.previousWindowID.set(winid === -1 ? undefined : winid);
      }
    }
  }

  async prevWinnrByPrevBufnr() {
    const previousBufnr = await this.previousBufnr.get();
    if (!previousBufnr) {
      return;
    }
    const winnr = (await this.nvim.call('bufwinnr', [previousBufnr])) as number;
    if (winnr <= 0 || (await this.winnrs()).includes(winnr)) {
      return;
    }
    return winnr;
  }

  async prevWinnrByPrevWindowID() {
    const previousWindowID = await this.previousWindowID.get();
    if (!previousWindowID) {
      return;
    }
    const winnr = (await this.nvim.call('win_id2win', [
      previousWindowID,
    ])) as number;
    if (winnr <= 0 || (await this.winnrs()).includes(winnr)) {
      return;
    }
    return winnr;
  }

  bufnrs(): number[] {
    return this.explorers().map((explorer) => explorer.bufnr);
  }

  async winids(): Promise<number[]> {
    return compactI(
      await Promise.all(this.explorers().map((explorer) => explorer.winid)),
    );
  }

  async winnrs() {
    const tabid = await this.currentTabId();
    const explorers: Explorer[] = [];
    const container = this.tabContainer[tabid];
    if (container) {
      explorers.push(...container.left);
      explorers.push(...container.right);
      explorers.push(...container.tab);
    }
    const winnrs = await Promise.all(
      explorers.map((explorer) => explorer.winnr),
    );
    return winnrs.filter((winnr) => winnr !== undefined);
  }

  explorers() {
    const explorers: Explorer[] = [];
    for (const container of Object.values(this.tabContainer)) {
      explorers.push(...container.left);
      explorers.push(...container.right);
      explorers.push(...container.tab);
      explorers.push(...container.floating);
    }
    return explorers;
  }

  currentExplorer() {
    return this.explorerByBufnr(workspace.bufnr);
  }

  async explorerByWinid(winid: number) {
    for (const e of this.explorers()) {
      if ((await e.winid) === winid) {
        return e;
      }
    }
  }

  explorerByBufnr(bufnr: number) {
    return this.explorers().find((e) => e.bufnr === bufnr);
  }

  inExplorer() {
    return this.currentExplorer() !== undefined;
  }

  async registerMappings() {
    this.mappings = {};
    const mappings = await getMappings();
    Object.entries(mappings).forEach(([key, actionExp]) => {
      if (!Array.isArray(actionExp) && actionExp.name === 'unmap') {
        // eslint-disable-next-line no-restricted-properties
        workspace.showMessage(
          'The "unmap" option of explorer.keyMappings has been deprecated, use false instead of "unmap"',
          'warning',
        );
        return;
      }

      this.mappings[key] = {};
      (['n', 'v'] as const).forEach((mode) => {
        if (mode === 'v' && ['o', 'j', 'k'].includes(key)) {
          return;
        }
        const plugKey = `explorer-action-${mode}-${key.replace(
          /\<(.*)\>/,
          '[$1]',
        )}`;
        this.context.subscriptions.push(
          workspace.registerKeymap(
            [mode],
            plugKey,
            async () => {
              const count = (await this.nvim.eval('v:count')) as number;
              const explorer = this.currentExplorer();
              explorer
                ?.doActionsWithCount(actionExp, mode, count || 1)
                .catch(onError);
            },
            { sync: true },
          ),
        );
        this.mappings[key][mode] = `<Plug>(coc-${plugKey})`;
      });
    });
    await this.nvim.call('coc_explorer#register_mappings', [this.mappings]);
    this.registeredMapping = true;
    this.onRegisteredMapping.fire();
  }

  async executeMappings() {
    await this.nvim.call('coc_explorer#execute_mappings', [this.mappings]);
  }

  async clearMappings() {
    await this.nvim.call('coc_explorer#clear_mappings', [this.mappings]);
  }

  async rootUri(args: Args) {
    const rootUri = await args.value(argOptions.rootUri);
    if (rootUri) {
      return rootUri;
    }
    let useGetcwd = false;
    const buftype = await workspace.nvim.getVar('&buftype');
    if (buftype === 'nofile') {
      useGetcwd = true;
    } else {
      const bufname = await workspace.nvim.call('bufname', ['%']);
      if (!bufname) {
        useGetcwd = true;
      }
    }
    return useGetcwd ? workspace.cwd : workspace.rootPath;
  }

  async open(argStrs: string[]) {
    if (!this.registeredMapping) {
      await new Promise((resolve) => {
        this.onInited.event(resolve);
      });
    }

    let isFirst = true;

    const config = configLocal();
    const explorerConfig = buildExplorerConfig(config);

    const args = await Args.parse(argStrs, config);

    const quit = await args.value(argOptions.quit);
    const position = await args.value(argOptions.position);

    const tabid =
      position === 'tab'
        ? (await this.currentTabIdMax()) + 1
        : await this.currentTabId();
    if (!(tabid in this.tabContainer)) {
      this.tabContainer[tabid] = {
        left: [],
        right: [],
        tab: [],
        floating: [],
      };
    }
    let explorers: Explorer[] = [];
    if (position === 'left') {
      explorers = this.tabContainer[tabid].left;
    } else if (position === 'right') {
      explorers = this.tabContainer[tabid].right;
    } else if (position === 'tab') {
      explorers = this.tabContainer[tabid].tab;
    } else if (position === 'floating') {
      if (supportedNvimFloating()) {
        explorers = this.tabContainer[tabid].floating;
      } else {
        throw new Error('not support floating position in vim');
      }
    }

    const sourceWinid = (await this.nvim.call('win_getid')) as number;
    const sourceBufnr = workspace.bufnr;
    const rootPath = workspace.rootPath;

    let explorer = explorers[0];

    if (explorer && quit) {
      await explorer.quit();
      return;
    }

    if (!explorer) {
      explorer = await Explorer.create(this, args, explorerConfig);
      explorers.push(explorer);
    } else if (!(await this.nvim.call('bufexists', [explorer.bufnr]))) {
      explorer = await Explorer.create(this, args, explorerConfig);
      explorers[0] = explorer;
    } else if (!(await explorer.inited.get())) {
      await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
      explorer = await Explorer.create(this, args, explorerConfig);
      explorers[0] = explorer;
    } else {
      const win = await explorer.win;
      if (win && (await args.value(argOptions.toggle))) {
        await explorer.quit();
        return;
      }
      await explorer.resume(args);
      isFirst = false;
    }
    await explorer.sourceWinid.set(sourceWinid);
    await explorer.sourceBufnr.set(sourceBufnr);
    await explorer.open(args, rootPath, isFirst);
  }
}
