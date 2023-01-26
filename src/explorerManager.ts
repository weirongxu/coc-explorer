import { HelperEventEmitter, isTest } from 'coc-helper';
import { Disposable, disposeAll, ExtensionContext, workspace } from 'coc.nvim';
import { firstValueFrom } from 'rxjs';
import { argOptions, ResolvedArgs } from './arg/argOptions';
import { Args } from './arg/parseArgs';
import type { BufManager } from './bufManager';
import { buildExplorerConfig, configLocal } from './config';
import { tabContainerManager } from './container';
import { GlobalContextVars } from './contextVariables';
import { onBufEnter } from './events';
import { Explorer } from './explorer';
import { Rooter } from './rooter';
import { getClipboard } from './source/sources/file/clipboard/clipboard';
import {
  compactI,
  currentBufnr,
  fromHelperEvent,
  logger,
  supportedNvimFloating,
} from './util';

export class ExplorerManager {
  filetype = 'coc-explorer';
  previousBufnr = new GlobalContextVars<number>('previousBufnr');
  previousWindowID = new GlobalContextVars<number>('previousWindowID');
  maxExplorerID = 0;
  nvim = workspace.nvim;
  events = new HelperEventEmitter<{
    inited: () => void;
  }>(logger);
  waitInited = firstValueFrom(fromHelperEvent(this.events, 'inited'));
  clipboardStorage = getClipboard(this);

  constructor(public context: ExtensionContext, public bufManager: BufManager) {
    currentBufnr().then(this.updatePrevCtxVars.bind(this)).catch(logger.error);
    this.context.subscriptions.push(
      onBufEnter(async (bufnr) => {
        await this.updatePrevCtxVars(bufnr);
      }, 0),
    );

    this.context.subscriptions.push(
      Disposable.create(() => disposeAll(this.explorers())),
    );
  }

  private async updatePrevCtxVars(bufnr: number) {
    if (isTest) return;
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
    const container = await tabContainerManager.currentTabContainer();
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
    for (const container of tabContainerManager.values()) {
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

  private async checkResume(explorer: Explorer, argValues: ResolvedArgs) {
    if (argValues.position.name !== 'floating') {
      return true;
    }
    if (!(await (await explorer.sourceBuffer())?.loaded)) {
      // Open a new explorer when sourceBuffer unload,
      // because nvim will clear the wininfo of float win
      // issue: https://github.com/weirongxu/coc-explorer/issues/472
      await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
      return false;
    }
    if (!(await explorer.buffer.valid)) {
      return false;
    }
    if (!(await this.nvim.call('bufexists', [explorer.borderBufnr]))) {
      await this.nvim.command(`bwipeout! ${explorer.bufnr}`);
      return false;
    }
    return true;
  }

  async open(argStrs: string[]) {
    await this.waitInited;

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
        ? (await tabContainerManager.currentTabMaxId()) + 1
        : await tabContainerManager.currentTabId();
    const tabContainer = tabContainerManager.get(tabid);

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
        if (await this.checkResume(explorer, argValues)) {
          await explorer.resume(argValues);
        } else {
          explorer = await Explorer.create(this, argValues, explorerConfig);
          tabContainer.setExplorer(position, explorer);
        }
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
