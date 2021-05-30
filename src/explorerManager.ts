import { HelperEventEmitter } from 'coc-helper';
import {
  Disposable,
  disposeAll,
  Emitter,
  ExtensionContext,
  workspace,
} from 'coc.nvim';
import { MappingMode } from './actions/types';
import { argOptions } from './arg/argOptions';
import { Args } from './arg/parseArgs';
import { BufManager } from './bufManager';
import { buildExplorerConfig, configLocal } from './config';
import { TabContainer } from './container';
import { GlobalContextVars } from './contextVariables';
import { onBufEnter } from './events';
import { Explorer } from './explorer';
import { keyMapping } from './mappings';
import { Rooter } from './rooter';
import { compactI, currentBufnr, logger, supportedNvimFloating } from './util';

export class ExplorerManager {
  filetype = 'coc-explorer';
  previousBufnr = new GlobalContextVars<number>('previousBufnr');
  previousWindowID = new GlobalContextVars<number>('previousWindowID');
  maxExplorerID = 0;
  tabContainer: Record<number, TabContainer> = {};
  // TODO: remove
  rootPathRecords: Set<string> = new Set();
  nvim = workspace.nvim;
  bufManager: BufManager;

  events = new HelperEventEmitter<{
    didAutoload: () => void;
    registeredMapping: () => void;
  }>(logger);

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
   * mappings[mode][key] = '<Plug>(coc-action-mode-key)'
   */
  private mappings: Record<string, Record<string, string>> = {};

  constructor(public context: ExtensionContext) {
    this.waitAllEvents.constructor();

    this.events.on('didAutoload', () => {
      this.registerMappings().catch(logger.error);
    });

    currentBufnr().then(this.updatePrevCtxVars.bind(this)).catch(logger.error);
    this.context.subscriptions.push(
      onBufEnter(async (bufnr) => {
        await this.updatePrevCtxVars(bufnr);
      }, 0),
    );

    this.context.subscriptions.push(
      Disposable.create(() => disposeAll(this.explorers())),
    );

    this.bufManager = new BufManager(this.context, this);
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
      const bufname = (await this.nvim.call('bufname')) as string;
      if (
        bufname.startsWith('list://') ||
        bufname.startsWith('[coc-explorer]')
      ) {
        return;
      }
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

  async currentExplorer() {
    return this.explorerByBufnr(await currentBufnr());
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

  async inExplorer() {
    return (await this.currentExplorer()) !== undefined;
  }

  async registerMappings() {
    this.mappings = {};
    const commonKeys = [...(await keyMapping.getCommonKeys())];
    const keysModes: [MappingMode, string[]][] = [
      ['n', commonKeys],
      ['v', [...commonKeys, ...(await keyMapping.getVisualKeys())]],
    ];
    for (const [mode, keys] of keysModes) {
      this.mappings[mode] = {};
      for (const key of keys) {
        if (this.mappings[mode][key]) {
          continue;
        }
        if (mode === 'v' && ['o', 'j', 'k'].includes(key)) {
          continue;
        }
        const plugKey = `explorer-key-${mode}-${key.replace(
          /\<(.*)\>/,
          '[$1]',
        )}`;
        this.context.subscriptions.push(
          workspace.registerKeymap([mode], plugKey, async () => {
            const count = (await this.nvim.eval('v:count')) as number;
            const explorer = await this.currentExplorer();
            explorer?.action
              .doActionByKey(key, mode, count || 1)
              .catch(logger.error);
          }),
        );
        this.mappings[mode][key] = `<Plug>(coc-${plugKey})`;
      }
    }
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
    const argValues = await args.values(argOptions);
    const position = argValues.position;
    if (position.name === 'floating') {
      if (!supportedNvimFloating()) {
        throw new Error('not support floating position in vim');
      }
    }
    const quit = argValues.quit;

    const tabid =
      position.name === 'tab'
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
    const sourceBufnr = await currentBufnr();
    const rooter = new Rooter(workspace.root);

    if (!explorer || !(await this.nvim.call('bufexists', [explorer.bufnr]))) {
      explorer = await Explorer.create(this, argValues, explorerConfig);
      tabContainer.setExplorer(position, explorer);
    } else if (!(await explorer.inited.get())) {
      await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
      explorer = await Explorer.create(this, argValues, explorerConfig);
      tabContainer.setExplorer(position, explorer);
    } else {
      const win = await explorer.win;
      if (!win) {
        await explorer.resume(argValues);
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
    await explorer.open(args, rooter, isFirst);
  }
}
