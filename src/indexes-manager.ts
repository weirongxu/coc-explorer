import { Explorer } from './explorer';

interface BaseIndexItem {
  line: number;
}

export class BaseIndexes<IndexItem extends BaseIndexItem> {
  items: IndexItem[] = [];
  explorer?: Explorer;

  bindExplorer(explorer: Explorer) {
    this.explorer = explorer;
  }
}

export class IndexesManager {
  indexMap: Map<string, BaseIndexes<{ line: number }>> = new Map();

  constructor(public explorer: Explorer) {}

  removeLines(lines: number[]): void;
  removeLines(startLine: number, endLine: number): void;
  removeLines(startLineOrLines: number | number[], endLineOptional?: number) {
    if (Array.isArray(startLineOrLines)) {
      this.indexMap.forEach((i) => {
        i.items = i.items.filter((it) => !startLineOrLines.includes(it.line));
      });
    } else {
      const startLine = startLineOrLines;
      const endLine = endLineOptional === undefined ? Infinity : endLineOptional;
      this.indexMap.forEach((i) => {
        i.items = i.items.filter((item) => startLine <= item.line && item.line <= endLine);
      });
    }
  }

  offsetLines(startLine: number, offset: number) {
    this.indexMap.forEach((m) => {
      m.items.forEach((item) => {
        if (startLine <= item.line) {
          item.line += offset;
        }
      });
    });
  }

  addIndexes(name: string, indexes: BaseIndexes<any>) {
    indexes.bindExplorer(this.explorer);
    this.indexMap.set(name, indexes);
  }

  removeIndexes(name: string) {
    this.indexMap.delete(name);
  }
}
