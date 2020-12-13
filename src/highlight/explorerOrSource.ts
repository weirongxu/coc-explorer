import { workspace } from 'coc.nvim';
import type { Explorer } from '../explorer';
import { ExplorerSource } from '../source/source';
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

  async addSyntax() {
    const winnr = await this.explorer.winnr;
    const curWinnr = await workspace.nvim.call('winnr');
    if (winnr) {
      workspace.nvim.pauseNotification();
      if (winnr !== curWinnr) {
        workspace.nvim.command(`${winnr}wincmd w`, true);
      }
      hlGroupManager.addHighlightSyntaxNotify();
      if (winnr !== curWinnr) {
        workspace.nvim.command(`${curWinnr}wincmd w`, true);
      }
      await workspace.nvim.resumeNotification();
    }
  }
}

export class HighlightSource {
  constructor(
    public readonly source: ExplorerSource<any>,
    public readonly hlSrcId: number,
  ) {}

  addHighlightsNotify(highlights: HighlightPositionWithLine[]) {
    this.source.explorer.highlight.addHighlightsNotify(
      this.hlSrcId,
      highlights,
    );
  }

  clearHighlightsNotify(lineStart?: number, lineEnd?: number) {
    this.source.explorer.highlight.clearHighlightsNotify(
      this.hlSrcId,
      lineStart,
      lineEnd,
    );
  }
}
