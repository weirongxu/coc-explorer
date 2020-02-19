// modified from: https://github.com/neoclide/coc.nvim/blob/db5ffd2ff0d766c2cfbd711898e8a3f5736e038c/src/model/floatFactory.ts

import {
  disposeAll,
  Documentation,
  Env,
  FloatBuffer,
  snippetManager,
  workspace,
  Disposable,
  Window,
  Neovim,
  Buffer,
} from 'coc.nvim';
import { distinct } from 'coc.nvim/lib/util/array';
import { equals } from 'coc.nvim/lib/util/object';
import { BufferHighlight } from '@chemzqm/neovim';
import { log } from '../logger';
import { debounce, onEvents, supportedFloat } from '../util';
import { WindowConfig } from 'coc.nvim/lib/model/floatFactory';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import createPopup, { Popup } from 'coc.nvim/lib/model/popup';
import { Explorer } from '../explorer';
import { argOptions } from '../parse-args';

export class FloatingFactory2 implements Disposable {
  private targetBufnr?: number;
  private disposables: Disposable[] = [];
  private tokenSource?: CancellationTokenSource;

  private window!: Window;
  private floatBuffer!: FloatBuffer;
  private popup!: Popup;

  private alignTop = false;
  private pumAlignTop = false;
  private createTs = 0;
  private cursor: [number, number] = [0, 0];
  public shown = false;
  initedBuffer: any;

  constructor(
    private nvim: Neovim,
    private env: Env,
    private preferTop = false,
    private maxHeight = 999,
    private autoHide = true,
  ) {
    if (!supportedFloat()) {
      return;
    }
    onEvents(
      'BufEnter',
      (bufnr) => {
        if (this.buffer && bufnr == this.buffer.id) {
          return;
        }
        if (bufnr == this.targetBufnr) {
          return;
        }
        this.close();
      },
      null,
      this.disposables,
    );
    onEvents(
      'InsertLeave',
      (bufnr) => {
        if (this.buffer && bufnr == this.buffer.id) {
          return;
        }
        if (snippetManager.isActived(bufnr)) {
          return;
        }
        this.close();
      },
      null,
      this.disposables,
    );
    onEvents(
      'MenuPopupChanged',
      async (ev, cursorline) => {
        const pumAlignTop = (this.pumAlignTop = cursorline > ev.row);
        if (pumAlignTop == this.alignTop) {
          this.close();
        }
      },
      null,
      this.disposables,
    );
    onEvents(
      'CursorMoved',
      debounce(100, (bufnr, cursor) => {
        if (Date.now() - this.createTs < 100) {
          return;
        }
        this.onCursorMoved(false, bufnr, cursor);
      }),
      null,
      this.disposables,
    );
    onEvents('CursorMovedI', this.onCursorMoved.bind(this, true), null, this.disposables);
  }

  private onCursorMoved(insertMode: boolean, bufnr: number, cursor: [number, number]): void {
    if (!this.window || (this.buffer && bufnr == this.buffer.id)) {
      return;
    }
    if (bufnr == this.targetBufnr && equals(cursor, this.cursor)) {
      return;
    }
    if (this.autoHide) {
      this.close();
      return;
    }
    if (!insertMode || bufnr != this.targetBufnr || (this.cursor && cursor[0] != this.cursor[0])) {
      this.close();
      return;
    }
  }

  private async checkFloatBuffer(): Promise<void> {
    const { floatBuffer, nvim } = this;
    let window: Window | undefined = this.window;
    if (this.env.textprop) {
      const valid = await this.activated();
      if (!valid) {
        window = undefined;
      }
      if (!window) {
        this.popup = await createPopup(nvim, [''], {
          padding: [0, 1, 0, 1],
          highlight: 'CocFloating',
          tab: -1,
        });
        const win = (this.window = nvim.createWindow(this.popup.id));
        nvim.pauseNotification();
        win.setVar('float', 1, true);
        win.setOption('linebreak', true, true);
        win.setOption('showbreak', '', true);
        win.setOption('conceallevel', 2, true);
        await nvim.resumeNotification();
      }
      const buffer = this.nvim.createBuffer(this.popup!.bufferId);
      this.floatBuffer = new FloatBuffer(nvim, buffer, nvim.createWindow(this.popup!.id));
    } else {
      if (floatBuffer) {
        const valid = await floatBuffer.valid;
        if (valid) {
          return;
        }
      }
      const buf = await this.nvim.createNewBuffer(false, true);
      await buf.setOption('buftype', 'nofile');
      await buf.setOption('bufhidden', 'hide');
      this.floatBuffer = new FloatBuffer(this.nvim, buf);
    }
  }

  private get columns(): number {
    return this.env.columns;
  }

  private get lines(): number {
    return this.env.lines - this.env.cmdheight - 1;
  }

  public async getBoundings(
    explorer: Explorer,
    docs: Documentation[],
  ): Promise<WindowConfig | void> {
    const { nvim, preferTop } = this;
    const { columns, lines } = this;
    let alignTop = false;
    const [winBottomRow] = (await nvim.call('coc#util#win_position')) as [number, number];
    const explorerWin = await explorer.win;
    if (!explorerWin) {
      return;
    }
    const explorerWidth = await explorerWin.width;
    const maxWidth = columns - explorerWidth - 1;
    if (maxWidth <= 0) {
      return;
    }
    if (!this.floatBuffer) {
      throw Error('floatBuffer not initialize yet');
    }
    const previewHeight = Math.min(this.floatBuffer.getHeight(docs, maxWidth), this.maxHeight);
    if (!preferTop) {
      if (lines - winBottomRow < previewHeight && winBottomRow > previewHeight) {
        alignTop = true;
      }
    } else {
      if (winBottomRow >= previewHeight || winBottomRow >= lines - winBottomRow) {
        alignTop = true;
      }
    }
    if (alignTop) {
      docs.reverse();
    }
    this.alignTop = alignTop;
    await this.floatBuffer.setDocuments(docs, maxWidth);
    const { width: previewWidth } = this.floatBuffer;

    const explorerCursor = await explorer.currentCursor();
    if (!explorerCursor) {
      return;
    }
    const view: {
      topline: number;
      leftcol: number;
      lnum: number;
      col: number;
    } = await nvim.call('winsaveview', []);
    let col = 0;
    let row = explorerCursor.lineIndex - view.topline + 1 + (alignTop ? -previewHeight + 1 : 0);
    const position = await explorer.args.value(argOptions.position);
    if (position === 'left') {
      col = explorerWidth;
    } else if (position === 'right') {
      col = columns - previewWidth - explorerWidth;
    } else if (position === 'floating') {
      const winid = await explorer.winid;
      if (!winid) {
        return;
      }
      const { row: floatingRow, col: floatingCol } = (await nvim.call('nvim_win_get_config', [
        winid,
      ])) as WindowConfig;
      const floatingPosition = await explorer.args.value(argOptions.floatingPosition);
      row += floatingRow;
      if (floatingPosition === 'left-center') {
        col = floatingCol + explorerWidth;
      } else if (floatingPosition === 'right-center') {
        col = floatingCol - previewWidth;
      } else {
        return;
      }
    }

    return {
      row,
      col,
      width: previewWidth,
      height: previewHeight,
      relative: 'editor',
    };
  }

  public async create(
    explorer: Explorer,
    docs: Documentation[],
    highlights: BufferHighlight[] = [],
    allowSelection = false,
  ): Promise<void> {
    if (!supportedFloat()) {
      // tslint:disable-next-line: ban
      log('error', 'Floating window & textprop not supported!');
      return;
    }
    const shown = await this.createPopup(explorer, docs, highlights, allowSelection);
    if (!shown) {
      this.close(false);
    }
  }

  private async createPopup(
    explorer: Explorer,
    docs: Documentation[],
    highlights: BufferHighlight[],
    allowSelection = false,
  ): Promise<boolean> {
    if (this.tokenSource) {
      this.tokenSource.cancel();
    }
    if (docs.length == 0) {
      return false;
    }
    this.createTs = Date.now();
    this.targetBufnr = workspace.bufnr;
    const tokenSource = (this.tokenSource = new CancellationTokenSource());
    const token = tokenSource.token;
    await this.checkFloatBuffer();
    const config = await this.getBoundings(explorer, docs);
    const [mode, line, col, visible] = (await this.nvim.eval(
      '[mode(),line("."),col("."),pumvisible()]',
    )) as [string, number, number, number];
    this.cursor = [line, col];
    if (visible && this.alignTop == this.pumAlignTop) {
      return false;
    }
    if (!config || token.isCancellationRequested) {
      return false;
    }
    if (!this.checkMode(mode, allowSelection)) {
      return false;
    }
    const { nvim, alignTop } = this;
    if (mode == 's') {
      await nvim.call('feedkeys', ['\x1b', 'in']);
    }
    // helps to fix undo issue, don't know why.
    if (workspace.isNvim && mode.startsWith('i')) {
      await nvim.eval('feedkeys("\\<C-g>u", "n")');
    }
    let reuse = false;
    if (workspace.isNvim) {
      reuse = this.window && (await this.window.valid);
      if (!reuse) {
        this.window = await nvim.openFloatWindow(this.buffer, false, config);
      }
    }
    if (token.isCancellationRequested) {
      return false;
    }
    nvim.pauseNotification();
    if (workspace.isNvim) {
      if (!reuse) {
        nvim.command(`noa call win_gotoid(${this.window.id})`, true);
        this.window.setVar('float', 1, true);
        nvim.command(`setl nospell nolist wrap linebreak foldcolumn=1`, true);
        nvim.command(
          `setl nonumber norelativenumber nocursorline nocursorcolumn colorcolumn=`,
          true,
        );
        nvim.command(`setl signcolumn=no conceallevel=2 concealcursor=n`, true);
        nvim.command(
          `setl winhl=Normal:CocFloating,NormalNC:CocFloating,FoldColumn:CocFloating`,
          true,
        );
        nvim.call('coc#util#do_autocmd', ['CocOpenFloat'], true);
      } else {
        this.window.setConfig(config, true);
        nvim.command(`noa call win_gotoid(${this.window.id})`, true);
      }
      this.floatBuffer.setLines();
      nvim.command(`normal! ${alignTop ? 'G' : 'gg'}0`, true);
      for (const hl of highlights) {
        await this.buffer.addHighlight(hl);
      }
      nvim.command('noa wincmd p', true);
    } else {
      const filetypes = distinct(docs.map((d) => d.filetype));
      if (filetypes.length == 1) {
        this.popup.setFiletype(filetypes[0]);
      }
      this.popup.move({
        line: config.relative === 'cursor' ? cursorPostion(config.row) : config.row + 1,
        col: config.relative === 'cursor' ? cursorPostion(config.col) : config.col + 1,
        minwidth: config.width - 2,
        minheight: config.height,
        maxwidth: config.width - 2,
        maxheight: config.height,
        firstline: alignTop ? -1 : 1,
      });
      this.floatBuffer.setLines();
      for (const hl of highlights) {
        await this.buffer.addHighlight(hl);
      }
      nvim.command('redraw', true);
    }
    const [, err] = (await nvim.resumeNotification()) ?? [];
    if (err) {
      // tslint:disable-next-line: ban
      workspace.showMessage(`Error on ${err[0]}: ${err[1]} - ${err[2]}`, 'error');
      return false;
    }
    if (mode == 's') {
      await snippetManager.selectCurrentPlaceholder(false);
    }
    return true;
  }

  private checkMode(mode: string, allowSelection: boolean): boolean {
    if (mode == 's' && allowSelection) {
      return true;
    }
    return ['i', 'n', 'ic'].indexOf(mode) != -1;
  }

  /**
   * Close float window
   */
  public close(cancel = true): void {
    if (cancel && this.tokenSource) {
      if (this.tokenSource) {
        this.tokenSource.cancel();
        this.tokenSource = undefined;
      }
    }
    const { window, popup } = this;
    this.shown = false;
    if (this.env.textprop) {
      if (popup) {
        popup.dispose();
      }
    } else if (window) {
      window.close(true, true);
    }
  }

  public dispose(): void {
    if (this.tokenSource) {
      this.tokenSource.cancel();
    }
    disposeAll(this.disposables);
  }

  public get buffer(): Buffer {
    return this.floatBuffer?.buffer;
  }

  public async activated(): Promise<boolean> {
    if (this.env.textprop) {
      if (!this.popup) {
        return false;
      }
      return await this.popup.visible();
    }
    if (!this.window) {
      return false;
    }
    const valid = await this.window.valid;
    return valid;
  }
}

function cursorPostion(n: number): string {
  if (n == 0) {
    return 'cursor';
  }
  if (n < 0) {
    return `cursor${n}`;
  }
  return `cursor+${n}`;
}
