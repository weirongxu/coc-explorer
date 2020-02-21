import { workspace, ExtensionContext, Emitter, Disposable } from 'coc.nvim';
import { Explorer } from './explorer';
import { argOptions, Args } from './parse-args';
import { onError } from './logger';
import { mappings } from './mappings';
import { onBufEnter, supportedNvimFloating } from './util';
import { GlobalContextVars } from './context-variables';

export class ExplorerManager {
  bufferName = '[coc-explorer]';
  filetype = 'coc-explorer';
  emitterDidAutoload = new Emitter<void>();
  previousBufnr = new GlobalContextVars<number>('previousBufnr');
  previousWindowID = new GlobalContextVars<number>('previousWindowID');
  maxExplorerID = 0;
  tabContainer: Record<
    number,
    {
      left: Explorer[];
      right: Explorer[];
      tab: Explorer[];
      floating: Explorer[];
    }
  > = {};
  rootPathRecords: Set<string> = new Set();
  nvim = workspace.nvim;
  subscriptions: Disposable[];

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
    this.subscriptions = context.subscriptions;

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
    this.subscriptions.push(
      onBufEnter(async (bufnr) => {
        await this.updatePrevCtxVars(bufnr);
      }),
    );
  }

  async currentTabId() {
    return (await this.nvim.call('coc_explorer#tab_id')) as number;
  }

  async currentTabIdMax() {
    return (await this.nvim.call('coc_explorer#tab_id_max')) as number;
  }

  private async updatePrevCtxVars(bufnr: number) {
    if (!this.bufnrs().includes(bufnr)) {
      const filetype = await this.nvim.getVar('&filetype');
      if (filetype !== this.filetype) {
        await this.previousBufnr.set(bufnr);
        const winid = (await this.nvim.call('win_getid')) as number;
        await this.previousWindowID.set(winid === -1 ? null : winid);
      }
    }
  }

  async prevWinnrByPrevBufnr() {
    const previousBufnr = await this.previousBufnr.get();
    if (!previousBufnr) {
      return null;
    }
    const winnr = (await this.nvim.call('bufwinnr', [previousBufnr])) as number;
    if (winnr <= 0 || (await this.winnrs()).includes(winnr)) {
      return null;
    }
    return winnr;
  }

  async prevWinnrByPrevWindowID() {
    const previousWindowID = await this.previousWindowID.get();
    if (!previousWindowID) {
      return null;
    }
    const winnr = (await this.nvim.call('win_id2win', [previousWindowID])) as number;
    if (winnr <= 0 || (await this.winnrs()).includes(winnr)) {
      return null;
    }
    return winnr;
  }

  bufnrs(): number[] {
    return this.explorers().map((explorer) => explorer.bufnr);
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
    const winnrs = await Promise.all(explorers.map((explorer) => explorer.winnr));
    return winnrs.filter((winnr) => winnr !== null);
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
    const bufnr = workspace.bufnr;
    return this.explorers().find((e) => e.bufnr === bufnr);
  }

  inExplorer() {
    return this.currentExplorer() !== undefined;
  }

  async registerMappings() {
    this.mappings = {};
    Object.entries(mappings).forEach(([key, actions]) => {
      this.mappings[key] = {};
      (['n', 'v'] as const).forEach((mode) => {
        if (mode === 'v' && ['o', 'j', 'k'].includes(key)) {
          return;
        }
        const plugKey = `explorer-action-${mode}-${key.replace(/\<(.*)\>/, '[$1]')}`;
        this.subscriptions.push(
          workspace.registerKeymap(
            [mode],
            plugKey,
            async () => {
              const count = (await this.nvim.eval('v:count')) as number;
              const explorer = this.currentExplorer();
              explorer?.doActionsWithCount(actions, mode, count || 1).catch(onError);
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

  async open(argStrs: string[]) {
    if (!this.registeredMapping) {
      await new Promise((resolve) => {
        this.onInited.event(resolve);
      });
    }

    let isFirst = true;

    const args = await Args.parse(argStrs);

    const position = await args.value(argOptions.position);
    const tabid =
      position === 'tab' ? (await this.currentTabIdMax()) + 1 : await this.currentTabId();
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

    let explorer = explorers[0];

    if (!explorer) {
      explorer = await Explorer.create(this, args);
      explorers.push(explorer);
    } else if (!(await this.nvim.call('bufexists', [explorer.bufnr]))) {
      explorer = await Explorer.create(this, args);
      explorers[0] = explorer;
    } else if (!(await explorer.inited.get())) {
      await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
      explorer = await Explorer.create(this, args);
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
    await explorer.open(args, isFirst);
  }
}
