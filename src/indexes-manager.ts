import { Explorer } from './explorer';
import { BaseIndexes } from './indexes/base-indexes';

export class IndexesManager {
  indexMap: Map<string, BaseIndexes> = new Map();

  constructor(public explorer: Explorer) {}

  removeLines(lines: number[]): void;
  removeLines(startLine: number, endLine: number): void;
  removeLines(startLineOrLines: number | number[], endLineOptional?: number) {
    if (Array.isArray(startLineOrLines)) {
      this.indexMap.forEach((i) => {
        i.lines = i.lines.filter((line) => !startLineOrLines.includes(line));
      });
    } else {
      const startLine = startLineOrLines;
      const endLine = endLineOptional === undefined ? Infinity : endLineOptional;
      this.indexMap.forEach((i) => {
        i.lines = i.lines.filter((line) => startLine <= line && line <= endLine);
      });
    }
  }

  offsetLines(startLine: number, offset: number) {
    this.indexMap.forEach((m) => {
      m.lines.forEach((line) => {
        if (startLine <= line) {
          line += offset;
        }
      });
    });
  }

  addIndexes(name: string, indexes: BaseIndexes) {
    indexes.bindExplorer(this.explorer);
    this.indexMap.set(name, indexes);
  }

  removeIndexes(name: string) {
    this.indexMap.delete(name);
  }
}
