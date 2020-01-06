import { Highlight, HighlightConcealable, HlEscapeCode } from './highlight-manager';
import { byteLength } from '../util';

export type HighlightMode = 'conceal' | 'highlight';
export type HighlightPosition = {
  group: string;
  start: number;
  size: number;
  relativeLineIndex?: number;
};
type DrawFn = (row: SourceRowBuilder) => void | Promise<void>;
type DrawOption = {
  highlightMode?: HighlightMode;
  relativeLineIndex?: number;
};

export class SourceViewBuilder {
  async drawRowLine(draw: DrawFn, options: DrawOption = {}): Promise<string> {
    const row = await this.drawRow(draw, options);
    return row.content;
  }

  async drawRow(
    draw: DrawFn,
    { highlightMode = 'conceal', relativeLineIndex }: DrawOption = {},
  ): Promise<SourceRowBuilder> {
    const row = new SourceRowBuilder(this, highlightMode, relativeLineIndex);
    await draw(row);
    return row;
  }
}

export class SourceRowBuilder {
  curPosition: number = 0;
  content = '';
  highlightPositions: HighlightPosition[] = [];

  constructor(
    public view: SourceViewBuilder,
    public highlightMode: HighlightMode,
    public relativeLineIndex?: number,
  ) {}

  concealableColumn(hlConcealableCmd: HighlightConcealable, block: () => void) {
    const markerID = hlConcealableCmd.markerID;
    if (this.highlightMode === 'conceal') {
      this.content += HlEscapeCode.left(markerID);
    }
    block();
    if (this.highlightMode === 'conceal') {
      this.content += HlEscapeCode.right(markerID);
    }
  }

  add(content: string, hlCmd?: Highlight) {
    let newContent = '';
    if (hlCmd && content) {
      const markerID = hlCmd.markerID;
      const start = this.curPosition;

      if (this.highlightMode === 'conceal') {
        newContent += HlEscapeCode.left(markerID);
      }

      newContent += content;

      if (this.highlightMode === 'conceal') {
        newContent += HlEscapeCode.right(markerID);
      }

      this.highlightPositions.push({
        group: hlCmd.group,
        start,
        size: byteLength(newContent),
        relativeLineIndex: this.relativeLineIndex,
      });
    } else {
      newContent += content;
    }

    this.curPosition += byteLength(newContent);
    this.content += newContent;
  }
}
