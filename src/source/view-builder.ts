import { Range } from 'vscode-languageserver-protocol';
import { byteLength } from '../util';

export class SourceRowBuilder {
  col: number = 0;
  content = '';

  constructor(public view: SourceViewBuilder<any>, public line: number) {}

  add(content: string, hlGroup?: string) {
    if (hlGroup) {
      if (!this.view.relativeHlRanges[hlGroup]) {
        this.view.relativeHlRanges[hlGroup] = [];
      }
      this.view.relativeHlRanges[hlGroup].push(
        Range.create(
          {
            line: this.line,
            character: this.col,
          },
          {
            line: this.line,
            character: this.col + byteLength(content),
          },
        ),
      );
    }
    this.col += byteLength(content);
    this.content += content;
  }
}

export class SourceViewBuilder<Item> {
  currentLine: number;
  lines: [string, null | Item][] = [];
  relativeHlRanges: Record<string, Range[]> = {};

  constructor() {
    this.relativeHlRanges = {};
    this.lines = [];
    this.currentLine = 0;
  }

  newRoot(draw: (row: SourceRowBuilder) => void) {
    const row = new SourceRowBuilder(this, this.currentLine);
    draw(row);
    this.lines.push([row.content, null]);
    this.currentLine++;
  }

  newItem(item: Item, draw: (row: SourceRowBuilder) => void) {
    const row = new SourceRowBuilder(this, this.currentLine);
    draw(row);
    this.lines.push([row.content, item]);
    this.currentLine++;
  }
}
