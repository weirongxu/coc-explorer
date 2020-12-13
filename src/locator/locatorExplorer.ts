import { Notifier } from 'coc-helper';
import { workspace } from 'coc.nvim';
import { Explorer } from '../explorer';
import { ViewExplorer } from '../view/viewExplorer';
import { MarkExplorer } from './markExplorer';

export class LocatorExplorer {
  readonly mark: MarkExplorer;
  readonly view: ViewExplorer;

  constructor(public readonly explorer: Explorer) {
    this.mark = new MarkExplorer(this.explorer);
    this.view = this.explorer.view;
  }

  async gotoPrevMark(...names: string[]) {
    const lineIndex = await this.mark.prevLineIndex(...names);
    if (lineIndex) {
      await this.gotoLineIndex(lineIndex);
      return true;
    }
    return false;
  }

  async gotoNextMark(...names: string[]) {
    const lineIndex = await this.mark.nextLineIndex(...names);
    if (lineIndex) {
      await this.gotoLineIndex(lineIndex);
      return true;
    }
    return false;
  }

  async gotoLineIndex(lineIndex: number) {
    return (await this.gotoLineIndexNotifier(lineIndex)).run();
  }

  async gotoLineIndexNotifier(lineIndex: number, col?: number) {
    const win = await this.explorer.win;
    return Notifier.create(() => {
      if (win) {
        const height = this.explorer.height;
        if (lineIndex < 0) {
          lineIndex = 0;
        } else if (lineIndex >= height) {
          lineIndex = height - 1;
        }
        this.view.currentLineIndex = lineIndex;
        win.setCursor([lineIndex + 1, col ?? 0], true);
        if (workspace.isVim) {
          workspace.nvim.command('redraw', true);
        } else {
          workspace.nvim.command('redraw!', true);
        }
      }
    });
  }
}
