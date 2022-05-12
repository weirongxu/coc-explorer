import { Notifier, WinLayoutFinder } from 'coc-helper';
import { Neovim, workspace } from 'coc.nvim';
import { ParsedPosition } from 'src/arg/parseArgs';
import { argOptions } from '../arg/argOptions';
import type { Explorer } from '../explorer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { OpenCursorPosition, OpenStrategy } from '../types';
import { hasOwnProperty, selectWindowsUI } from '../util';

class OpenActionContext {
  nvim: Neovim;
  explorerPosition: ParsedPosition;
  openByWinnr: (winnr: number) => void | Promise<void>;

  constructor(
    public explorer: Explorer,
    public source: ExplorerSource<any>,
    public cursorPosition: OpenCursorPosition | undefined,
    originalOpenByWinnr: ((winnr: number) => void | Promise<void>) | undefined,
    public getFullpath: () => string | Promise<string>,
    private quitOnOpenNotifier: () => Notifier | Promise<Notifier>,
    public explorerWinid: number | undefined,
  ) {
    this.nvim = workspace.nvim;

    // explorer position
    this.explorerPosition = explorer.argValues.position;

    // open by winnr
    this.openByWinnr =
      originalOpenByWinnr ??
      (async (winnr: number) => {
        const escapedPath = await this.getEscapePath();
        await this.openWrap(() => {
          this.nvim.command(`${winnr}wincmd w`, true);
          this.nvim.command(`edit ${escapedPath}`, true);
          if (workspace.isVim) {
            // Avoid vim highlight not working,
            // https://github.com/weirongxu/coc-explorer/issues/113
            this.nvim.command('redraw', true);
          }
        });
      });
  }

  private jumpToNotify() {
    if (this.cursorPosition === 'keep') {
      if (!this.explorerWinid) {
        return;
      }
      this.nvim.call('win_gotoid', [this.explorerWinid], true);
    } else if (this.cursorPosition) {
      this.nvim.call(
        'cursor',
        [
          this.cursorPosition.lineIndex + 1,
          (this.cursorPosition.columnIndex ?? 0) + 1,
        ],
        true,
      );
    }
  }

  async openWrap(callback: () => void, options?: { earlyQuit?: boolean }) {
    const earlyQuit = options?.earlyQuit ?? false;
    const notifiers: Notifier.Cell[] = [];
    if (earlyQuit) await this.explorer.tryQuitOnOpen();
    else notifiers.push(await this.quitOnOpenNotifier());
    const wins = await this.nvim.windows;
    const resizeIt = wins.length === 1;
    this.nvim.pauseNotification();
    callback();
    Notifier.notifyAll(notifiers);
    this.jumpToNotify();
    if (resizeIt) this.explorer.resizeNotifier().notify();
    await this.nvim.resumeNotification();
  }

  async getEscapePath(): Promise<string> {
    let path = await this.getFullpath();
    if (this.explorer.config.get('openAction.relativePath')) {
      path = await workspace.nvim.call('fnamemodify', [path, ':.']);
    }
    return await workspace.nvim.call('fnameescape', [path]);
  }

  async tryResize() {
    await this.explorer.resize();
  }
}

class OpenActions {
  constructor(public ctx: OpenActionContext) {}

  async select() {
    const ctx = this.ctx;
    if (ctx.explorerPosition.name === 'floating') {
      await ctx.explorer.hide();
    }
    await selectWindowsUI(ctx.explorer.config, ctx.source.sourceType, {
      onSelect: async (winnr) => {
        await ctx.openByWinnr(winnr);
      },
      noChoice: async () => {
        await this.vsplit();
      },
      onCancel: async () => {
        if (ctx.explorerPosition.name === 'floating') {
          await ctx.explorer.show();
        }
      },
    });
  }

  async splitIntelligent(
    command: 'split' | 'vsplit',
    fallbackStrategy: OpenStrategy,
  ) {
    const ctx = this.ctx;
    const explWinid = await ctx.explorer.winid;
    if (!explWinid) {
      return;
    }

    const winFinder = await WinLayoutFinder.create();
    const node = winFinder.findWinid(explWinid);
    if (node) {
      if (node.parent && node.parent.group.type === 'row') {
        const target =
          node.parent.group.children[
            node.parent.indexInParent +
              (ctx.explorerPosition.name === 'left' ? 1 : -1)
          ];
        if (target) {
          const targetWinid = WinLayoutFinder.getFirstLeafWinid(target);
          const escapedPath = await ctx.getEscapePath();
          await ctx.openWrap(() => {
            ctx.nvim.call('win_gotoid', [targetWinid], true);
            ctx.nvim.command(`${command} ${escapedPath}`, true);
          });
        }
      } else {
        // only exlorer window or explorer is arranged in columns
        await this['vsplit.plain']();
      }
    } else {
      // floating
      await this[fallbackStrategy]();
    }
  }

  async split() {
    await this['split.intelligent']();
  }

  async 'split.plain'() {
    const ctx = this.ctx;
    const escapedPath = await ctx.getEscapePath();
    await ctx.openWrap(() => {
      ctx.nvim.command(`split ${escapedPath}`, true);
    });
  }

  async 'split.intelligent'() {
    const ctx = this.ctx;
    if (ctx.explorerPosition.name === 'floating') {
      await this['split.plain']();
      return;
    } else if (ctx.explorerPosition.name === 'tab') {
      await this.vsplit();
      return;
    }
    await this.splitIntelligent('split', 'split.plain');
  }

  async vsplit() {
    await this['vsplit.intelligent']();
  }
  async 'vsplit.plain'() {
    const ctx = this.ctx;
    const escapedPath = await ctx.getEscapePath();
    await ctx.openWrap(() => {
      ctx.nvim.command(`vsplit ${escapedPath}`, true);
    });
  }

  async 'vsplit.intelligent'() {
    const ctx = this.ctx;
    if (ctx.explorerPosition.name === 'floating') {
      await this['vsplit.plain']();
      return;
    } else if (ctx.explorerPosition.name === 'tab') {
      await this['vsplit.plain']();
      return;
    }
    await this.splitIntelligent('vsplit', 'vsplit.plain');
  }

  async tab() {
    const ctx = this.ctx;
    const escapedPath = await ctx.getEscapePath();
    await ctx.openWrap(
      () => {
        ctx.nvim.command(`tabedit ${escapedPath}`, true);
      },
      { earlyQuit: true },
    );
  }

  async previousBuffer() {
    const ctx = this.ctx;
    const prevWinnr = await ctx.explorer.explorerManager.prevWinnrByPrevBufnr();
    if (prevWinnr) {
      await ctx.openByWinnr(prevWinnr);
    } else {
      await this.vsplit();
    }
  }

  async previousWindow() {
    const ctx = this.ctx;
    const prevWinnr =
      await ctx.explorer.explorerManager.prevWinnrByPrevWindowID();
    if (prevWinnr) {
      await ctx.openByWinnr(prevWinnr);
    } else {
      await this.vsplit();
    }
  }

  async sourceWindow() {
    const ctx = this.ctx;
    const srcWinnr = await ctx.explorer.sourceWinnr();
    if (srcWinnr) {
      await ctx.openByWinnr(srcWinnr);
    } else {
      await this.vsplit();
    }
  }
}

export async function openAction(
  explorer: Explorer,
  source: ExplorerSource<any>,
  node: BaseTreeNode<any>,
  getFullpath: () => string | Promise<string>,
  {
    openByWinnr,
    openStrategy,
    cursorPosition,
  }: {
    openByWinnr?: (winnr: number) => void | Promise<void>;
    openStrategy?: OpenStrategy;
    cursorPosition?: OpenCursorPosition;
  },
) {
  if (node.expandable) {
    return;
  }

  let explorerWinid: number | undefined;
  let quitOnOpenNotifier: () => Notifier | Promise<Notifier>;
  if (cursorPosition === 'keep') {
    explorerWinid = await explorer.winid;
    quitOnOpenNotifier = () => Notifier.noop();
  } else {
    quitOnOpenNotifier = () => explorer.tryQuitOnOpenNotifier();
  }

  const context = new OpenActionContext(
    explorer,
    source,
    cursorPosition,
    openByWinnr,
    getFullpath,
    quitOnOpenNotifier,
    explorerWinid,
  );

  const actions = new OpenActions(context);

  if (!openStrategy) {
    openStrategy = await explorer.args.value(argOptions.openActionStrategy);
  }
  if (!hasOwnProperty(actions, openStrategy)) {
    new Error(`openStrategy(${openStrategy}) is not supported`);
  }
  await actions[openStrategy]();
}
