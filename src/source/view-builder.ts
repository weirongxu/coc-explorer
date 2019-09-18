import { HighlightCommand } from './highlight-manager';

export class SourceRowBuilder {
  content = '';

  constructor(public view: SourceViewBuilder<any>, public line: number) {}

  add(content: string, hlGroup?: HighlightCommand) {
    if (hlGroup && content) {
      content = `<${hlGroup.markerID}|` + content + `|${hlGroup.markerID}>`;
    }
    this.content += content;
  }
}

export class SourceViewBuilder<Item> {
  currentLine: number;
  lines: [string, null | Item][] = [];

  constructor() {
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
