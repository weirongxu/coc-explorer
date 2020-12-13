import { ExplorerSource } from '../source/source';
import { HighlightPositionWithLine } from './types';

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
