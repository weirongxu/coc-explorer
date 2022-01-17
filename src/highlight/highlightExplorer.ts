import { workspace } from 'coc.nvim';
import { Explorer } from '../explorer';
import { hlGroupManager } from './manager';
import { HighlightPositionWithLine } from './types';

export class HighlightExplorer {
  constructor(public readonly explorer: Explorer) {}

  clearHighlightsNotify(hlSrcId: number, lineStart?: number, lineEnd?: number) {
    hlGroupManager.clearHighlightsNotify(
      this.explorer,
      hlSrcId,
      lineStart,
      lineEnd,
    );
  }

  addHighlightsNotify(
    hlSrcId: number,
    highlights: HighlightPositionWithLine[],
  ) {
    hlGroupManager.addHighlightsNotify(this.explorer, hlSrcId, highlights);
  }

  async bootSyntax() {
    const winnr = await this.explorer.winnr;
    const curWinnr: number = await workspace.nvim.call('winnr');
    if (winnr) {
      workspace.nvim.pauseNotification();
      if (winnr !== curWinnr) {
        workspace.nvim.command(`${winnr}wincmd w`, true);
      }
      hlGroupManager.bootHighlightSyntaxNotify();
      if (winnr !== curWinnr) {
        workspace.nvim.command(`${curWinnr}wincmd w`, true);
      }
      await workspace.nvim.resumeNotification();
    }
  }
}
