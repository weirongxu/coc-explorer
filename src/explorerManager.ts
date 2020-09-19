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
import { Args, ArgPosition } from './parseArgs';
import { compactI, supportedNvimFloating } from './util';

export class TabContainer {
  left?: Explorer;
  right?: Explorer;
  tab?: Explorer;
  floating?: Explorer;

  getExplorer(position: ArgPosition) {
    return this[position];
  }

  setExplorer(position: ArgPosition, explorer: Explorer) {
    this[position] = explorer;
  }

  all() {
    const explorers = [];
    if (this.left) {
      explorers.push(this.left);
    }
    if (this.right) {
      explorers.push(this.right);
    }
    if (this.tab) {
      explorers.push(this.tab);
    }
    if (this.floating) {
      explorers.push(this.floating);
    }
    return explorers;
  }
}

export class ExplorerManager {
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
    return (await this.nvim.call('coc_explorer#tab#current_id')) as number;
  }

  async currentTabMaxId() {
    return (await this.nvim.call('coc_explorer#tab#max_id')) as number;
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

  /**
   * Get all winnrs from explorers
   */
  async winnrs() {
    const container = await this.currentTabContainer();
    const explorers = container?.all();
    if (explorers) {
      const winnrs = await Promise.all(
        explorers.map((explorer) => explorer.winnr),
      );
      return winnrs.filter((winnr): winnr is number => winnr !== undefined);
    } else {
      return [];
    }
  }

  /**
   * Get all explorers
   */
  explorers() {
    const explorers: Explorer[] = [];
    for (const container of Object.values(this.tabContainer)) {
      explorers.push(...container.all());
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
    await this.nvim.call('coc_explorer#mappings#register', [this.mappings]);
    this.registeredMapping = true;
    this.onRegisteredMapping.fire();
  }

  async executeMappings() {
    await this.nvim.call('coc_explorer#mappings#execute', [this.mappings]);
  }

  async clearMappings() {
    await this.nvim.call('coc_explorer#mappings#clear', [this.mappings]);
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
    const position = await args.value(argOptions.position);
    if (position === 'floating') {
      if (!supportedNvimFloating()) {
        throw new Error('not support floating position in vim');
      }
    }
    const quit = await args.value(argOptions.quit);

    const tabid =
      position === 'tab'
        ? (await this.currentTabMaxId()) + 1
        : await this.currentTabId();
    if (!(tabid in this.tabContainer)) {
      this.tabContainer[tabid] = new TabContainer();
    }
    const tabContainer = this.tabContainer[tabid];

    let explorer = tabContainer.getExplorer(position);
    if (explorer && quit) {
      await explorer.quit();
      return;
    }

    const sourceWinid = (await this.nvim.call('win_getid')) as number;
    const sourceBufnr = workspace.bufnr;
    const rootPath = workspace.rootPath;

    if (!explorer || !(await this.nvim.call('bufexists', [explorer.bufnr]))) {
      explorer = await Explorer.create(this, args, explorerConfig);
      tabContainer.setExplorer(position, explorer);
    } else if (!(await explorer.inited.get())) {
      await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
      explorer = await Explorer.create(this, args, explorerConfig);
      tabContainer.setExplorer(position, explorer);
    } else {
      const win = await explorer.win;
      if (!win) {
        await explorer.resume(args);
      } else {
        if (await args.value(argOptions.toggle)) {
          await explorer.quit();
          return;
        }

        if (await args.value(argOptions.focus)) {
          await explorer.focus();
          return;
        }
      }
      isFirst = false;
    }
    await explorer.sourceWinid.set(sourceWinid);
    await explorer.sourceBufnr.set(sourceBufnr);
    await explorer.open(args, rootPath, isFirst);
  }
}
