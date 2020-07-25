import { Disposable, workspace, disposeAll, Buffer, Neovim } from 'coc.nvim';
import { BufferHighlight, Window } from '@chemzqm/neovim';
import { FloatingCreateOptions, FloatingOpenOptions } from '../types';
import { closeWinByBufnrNotifier } from '../util';
import { onEvent } from '../events';

export class FloatingWindow implements Disposable {
  buffer: Buffer;
  borderBuffer?: Buffer;
  win?: Window;
  borderWin?: Window;
  nvim: Neovim;

  static async create(options: FloatingCreateOptions = {}) {
    const nvim = workspace.nvim;
    const [bufnr, borderBufnr]: [number, number | null] = await nvim.call(
      'coc_explorer#float#create',
      [
        {
          ...options,
        },
      ],
    );
    return new FloatingWindow(bufnr, borderBufnr ?? undefined, options);
  }

  private disposables: Disposable[] = [];

  constructor(
    public bufnr: number,
    public borderBufnr: number | undefined,
    public options: FloatingCreateOptions,
  ) {
    this.buffer = workspace.nvim.createBuffer(bufnr);
    if (borderBufnr) {
      this.borderBuffer = workspace.nvim.createBuffer(borderBufnr);
      this.disposables.push(
        onEvent('BufWinLeave', async (curBufnr) => {
          if (curBufnr === this.bufnr) {
            await closeWinByBufnrNotifier([borderBufnr]).run();
          }
        }),
      );
    }
    this.nvim = workspace.nvim;
  }

  async open(
    lines: string[],
    highlights: BufferHighlight[],
    options: FloatingOpenOptions,
  ) {
    await this.close();
    this.nvim.pauseNotification();
    this.buffer.setOption('modifiable', true, true);
    this.buffer.setOption('readonly', false, true);
    void this.buffer.setLines(lines, { start: 0, end: -1 }, true);
    this.buffer.setOption('modifiable', false, true);
    this.buffer.setOption('readonly', true, true);
    for (const hl of highlights) {
      void this.buffer.addHighlight(hl);
    }
    await this.nvim.resumeNotification();
    const [winid, borderWinid]: [
      number,
      number?,
    ] = await this.nvim.call('coc_explorer#float#open', [
      this.bufnr,
      { ...options, border_bufnr: this.borderBufnr, focus: false },
    ]);
    if (workspace.isVim) {
      await this.nvim.command('redraw!');
    }
    this.win = this.nvim.createWindow(winid);
    this.borderWin = borderWinid ? this.nvim.createWindow(winid) : undefined;
  }

  async close() {
    if (workspace.isNvim) {
      await closeWinByBufnrNotifier([this.bufnr]).run();
    } else {
      if (this.win) {
        await this.nvim.call('popup_close', [this.win.id]).catch();
      }
    }
  }

  dispose() {
    disposeAll(this.disposables);
    this.disposables.forEach((s) => s.dispose());
  }
}
