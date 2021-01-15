import { BufferHighlight, Disposable, workspace } from 'coc.nvim';
import { FloatingCreateOptions, FloatingOpenOptions } from '../types';
import { FloatingWindow as HelperFloatingWindow } from 'coc-helper';

export class FloatingWindow implements Disposable {
  bufnr: number;

  static async create(options: FloatingCreateOptions = {}) {
    const win = await HelperFloatingWindow.create({
      mode: 'show',
      name: options.name,
    });

    return new FloatingWindow(win);
  }

  constructor(public win: HelperFloatingWindow) {
    this.bufnr = this.win.bufnr;
  }

  dispose() {
    this.win.dispose();
  }

  async open(
    lines: string[],
    highlights: BufferHighlight[],
    options: FloatingOpenOptions,
  ) {
    await this.win.open({
      top: options.top,
      left: options.left,
      width: options.width,
      height: options.height,
      winHl: 'CocExplorerNormalFloat',
      winHlNC: 'CocExplorerNormalFloat',
      borderWinHl: 'CocExplorerNormalFloatBorder',
      lines,
      highlights,
      focus: false,
      initedExecute: ({ winid }) => {
        const scripts: string[] = [];
        if (workspace.isNvim) {
          scripts.push(`
            let store_winid = win_getid(winnr())
            if store_winid != ${winid}
              noau let successful = win_gotoid(${winid})
              if !successful
                return
              endif
            endif
          `);
          scripts.push('set filetype=');
          if (options.focusLineIndex) {
            scripts.push(`call nvim_win_set_cursor(${options.focusLineIndex})`);
          }
          if (!options.filetype && options.filepath) {
            scripts.push(
              `execute 'doautocmd filetypedetect BufRead ' . fnameescape('${options.filepath}')`,
            );
          }
          if (options.filetype) {
            scripts.push(`set filetype=${options.filetype}`);
          }
          scripts.push(`
            if store_winid != ${winid}
              noau call win_gotoid(store_winid)
            endif
          `);
        } else {
          scripts.push(`call win_execute(${winid}, 'set filetype=')`);
          if (options.focusLineIndex) {
            scripts.push(
              `call win_execute(${winid}, 'call cursor(${options.focusLineIndex}, 1)')`,
            );
          }
          if (!options.filetype && options.filepath) {
            scripts.push(
              `call win_execute(${winid}, 'doautocmd filetypedetect BufRead ' . fnameescape('${options.filepath}'))`,
            );
          }
          if (options.filetype) {
            scripts.push(
              `call win_execute(${winid}, 'set filetype=${options.filetype}'`,
            );
          }
        }
        return scripts.join('\n');
      },
    });
  }

  async close() {
    await this.win.close();
  }
}
