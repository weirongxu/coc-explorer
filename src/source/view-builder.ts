import { HighlightCommand, HighlightColumnHideCommand } from './highlight-manager';

export class SourceRowBuilder {
  content = '';

  constructor(public view: SourceViewBuilder<any>, public line: number) {}

  addColumn(hlColumnHideCmd: HighlightColumnHideCommand, block: () => void) {
    const markerID = hlColumnHideCmd.markerID;
    this.content += `<${markerID}|`;
    block();
    this.content += `|${markerID}>`;
  }

  add(content: string, hlCmd?: HighlightCommand) {
    if (hlCmd && content) {
      const markerID = hlCmd.markerID;
      content = `<${markerID}|${content}|${markerID}>`;
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

  drawLine(draw: (row: SourceRowBuilder) => void): string {
    const row = new SourceRowBuilder(this, this.currentLine);
    draw(row);
    return row.content;
  }

  newNode(item: Item, draw: (row: SourceRowBuilder) => void): string {
    const content = this.drawLine(draw);
    this.lines.push([content, item]);
    this.currentLine++;
    return content;
  }
}
