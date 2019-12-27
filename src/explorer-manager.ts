import { workspace, ExtensionContext, Emitter, Disposable } from 'coc.nvim';
import { Explorer } from './explorer';
import { Args, parseArgs } from './parse-args';
import { onError } from './logger';
import { mappings, ActionMode } from './mappings';
import { onBufEnter, avoidOnBufEnter } from './util';

export class ExplorerManager {
  bufferName = '[coc-explorer]';
  filetype = 'coc-explorer';
  emitterDidAutoload = new Emitter<void>();
  previousBufnr?: number;
  maxExplorerID = 0;
  tabContainer: Record<
    number,
    {
      left: Explorer[];
      right: Explorer[];
      tab: Explorer[];
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

    this.updatePreviousBufnr(workspace.bufnr).catch(onError);
    this.subscriptions.push(
      onBufEnter(1, (bufnr) => {
        this.updatePreviousBufnr(bufnr).catch(onError);
      }),
    );
  }

  async currentTabId() {
    return (await this.nvim.call('coc_explorer#tab_id')) as number;
  }

  async currentTabIdMax() {
    return (await this.nvim.call('coc_explorer#tab_id_max')) as number;
  }

  async updatePreviousBufnr(bufnr: number) {
    setTimeout(async () => {
      if (!this.bufnrs().includes(bufnr)) {
        const filetype = await this.nvim.getVar('&filetype');
        if (filetype !== this.filetype) {
          this.previousBufnr = bufnr;
        }
      }
    }, 10);
  }

  bufnrs(): number[] {
    return this.explorers().map((explorer) => explorer.bufnr);
  }

  explorers() {
    const explorers: Explorer[] = [];
    for (const container of Object.values(this.tabContainer)) {
      explorers.push(...container.left);
      explorers.push(...container.right);
      explorers.push(...container.tab);
    }
    return explorers;
  }

  async currentExplorer() {
    const bufnr = workspace.bufnr;
    return this.explorers().find((e) => e.bufnr === bufnr);
  }

  async registerMappings() {
    this.mappings = {};
    Object.entries(mappings).forEach(([key, actions]) => {
      this.mappings[key] = {};
      (['n', 'v'] as ActionMode[]).forEach((mode) => {
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
              const explorer = await this.currentExplorer();
              explorer?.doActions(actions, mode, count || 1).catch(onError);
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

  async createExplorer(args: Args) {
    this.maxExplorerID += 1;
    return avoidOnBufEnter(async () => {
      const bufnr = (await this.nvim.call('coc_explorer#create', [
        this.bufferName,
        this.maxExplorerID,
        args.position,
        args.width,
      ])) as number;
      const explorer = new Explorer(this.maxExplorerID, this, this.context, bufnr);
      await explorer.buffer.setVar('coc_explorer_inited', true);
      return explorer;
    });
  }

  async getExplorer(args: Args) {
    const tabid =
      args.position === 'tab' ? (await this.currentTabIdMax()) + 1 : await this.currentTabId();
    if (!(tabid in this.tabContainer)) {
      this.tabContainer[tabid] = {
        left: [],
        right: [],
        tab: [],
      };
    }
    let explorers: Explorer[] = [];
    if (args.position === 'left') {
      explorers = this.tabContainer[tabid].left;
    } else if (args.position === 'right') {
      explorers = this.tabContainer[tabid].right;
    } else if (args.position === 'tab') {
      explorers = this.tabContainer[tabid].tab;
    }
    if (!explorers.length) {
      explorers.push(await this.createExplorer(args));
    }

    let explorer = explorers[0];
    if (!(await this.nvim.call('bufexists', [explorer.bufnr]))) {
      explorer = await this.createExplorer(args);
      explorers[0] = explorer;
    } else {
      const inited = await explorer.buffer.getVar('coc_explorer_inited');
      if (!inited) {
        await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
        explorer = await this.createExplorer(args);
        explorers[0] = explorer;
      }
    }
    return explorer;
  }

  async open(argStrs: string[]) {
    if (!this.registeredMapping) {
      await new Promise((resolve) => {
        this.onInited.event(resolve);
      });
    }

    const args = await parseArgs(argStrs);

    const explorer = await this.getExplorer(args);

    await explorer.open(args);
  }
}
