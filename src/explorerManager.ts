import {
  Disposable,
  disposeAll,
  Emitter,
  ExtensionContext,
  workspace,
} from 'coc.nvim';
import { HelperEventEmitter } from 'coc-helper';
import { argOptions } from './argOptions';
import { BufManager } from './bufManager';
import { buildExplorerConfig, configLocal } from './config';
import { GlobalContextVars } from './contextVariables';
import { DiagnosticManager } from './diagnosticManager';
import { onBufEnter } from './events';
import { Explorer } from './explorer';
import { keyMapping } from './mappings';
import { Args, ArgPosition } from './parseArgs';
import { compactI, onError, supportedNvimFloating } from './util';

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
  previousBufnr = new GlobalContextVars<number>('previousBufnr');
  previousWindowID = new GlobalContextVars<number>('previousWindowID');
  maxExplorerID = 0;
  tabContainer: Record<number, TabContainer> = {};
  rootPathRecords: Set<string> = new Set();
  nvim = workspace.nvim;
  bufManager: BufManager;
  diagnosticManager: DiagnosticManager;

  events = new HelperEventEmitter<{
    didAutoload: () => void;
    registeredMapping: () => void;
  }>(onError);

  waitAllEvents = ((self) => ({
    didCount: 0,
    did: false,
    emitter: new Emitter<void>(),
    keys: ['registeredMapping', 'didAutoload'] as const,
    constructor() {
      this.keys.forEach((key) => {
        self.events.on(key, () => {
          this.didCount += 1;
          if (this.didCount >= this.keys.length) {
            this.did = true;
            this.emitter.fire();
          }
        });
      });
    },
  }))(this);

  /**
   * mappings[key][mode] = '<Plug>(coc-action-mode-key)'
   */
  private mappings: Record<string, Record<string, string>> = {};

  constructor(public context: ExtensionContext) {
    this.waitAllEvents.constructor();

    this.events.on('didAutoload', () => {
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
    (await keyMapping.getAllKeys()).forEach((key) => {
      this.mappings[key] = {};
      (['n', 'v'] as const).forEach((mode) => {
        if (mode === 'v' && ['o', 'j', 'k'].includes(key)) {
          return;
        }
        const plugKey = `explorer-key-${mode}-${key.replace(
          /\<(.*)\>/,
          '[$1]',
        )}`;
        this.context.subscriptions.push(
          workspace.registerKeymap([mode], plugKey, async () => {
            const count = (await this.nvim.eval('v:count')) as number;
            const explorer = this.currentExplorer();
            explorer?.doActionByKey(key, mode, count || 1).catch(onError);
          }),
        );
        this.mappings[key][mode] = `<Plug>(coc-${plugKey})`;
      });
    });
    await this.nvim.call('coc_explorer#mappings#register', [this.mappings]);
    await this.events.fire('registeredMapping');
  }

  async executeMappings() {
    await this.nvim.call('coc_explorer#mappings#execute', [this.mappings]);
  }

  async clearMappings() {
    await this.nvim.call('coc_explorer#mappings#clear', [this.mappings]);
  }

  async open(argStrs: string[]) {
    if (!this.waitAllEvents.did) {
      await new Promise((resolve) => {
        this.waitAllEvents.emitter.event(resolve);
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
