import { Hightlight, HighlightConcealable } from './highlight-manager';

export class SourceRowBuilder {
  content = '';

  constructor(public view: SourceViewBuilder) {}

  concealableColumn(hlConcealableCmd: HighlightConcealable, block: () => void) {
    const markerID = hlConcealableCmd.markerID;
    this.content += `<${markerID}|`;
    block();
    this.content += `|${markerID}>`;
  }

  add(content: string, hlCmd?: Hightlight) {
    if (hlCmd && content) {
      const markerID = hlCmd.markerID;
      content = `<${markerID}|${content}|${markerID}>`;
    }
    this.content += content;
  }
}

export class SourceViewBuilder {
  drawLine(draw: (row: SourceRowBuilder) => void): string {
    const row = new SourceRowBuilder(this);
    draw(row);
    return row.content;
  }
}
