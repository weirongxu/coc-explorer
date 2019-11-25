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
  async drawLine(draw: (row: SourceRowBuilder) => void | Promise<void>): Promise<string> {
    const row = new SourceRowBuilder(this);
    await draw(row);
    return row.content;
  }
}
