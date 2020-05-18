import { Explorer } from './explorer';
import { enableWrapscan } from './util';

export class IndexingManager {
  linesMap: Map<string, Set<number>> = new Map();

  constructor(public explorer: Explorer) {}

  addLine(name: string, lineIndex: number) {
    if (!this.linesMap.has(name)) {
      this.linesMap.set(name, new Set<number>());
    }
    const lines = this.linesMap.get(name)!;
    lines.add(lineIndex);
  }

  removeLine(name: string, lineIndex: number) {
    if (!this.linesMap.has(name)) {
      this.linesMap.set(name, new Set<number>());
    }
    const lines = this.linesMap.get(name)!;
    lines.delete(lineIndex);
  }

  async prevLineIndex(...names: string[]): Promise<number | null> {
    let mergeLines: number[] = [];
    for (const name of names) {
      const lines = this.linesMap.get(name);
      mergeLines = mergeLines.concat(lines ? Array.from(lines) : []);
    }
    if (mergeLines.length) {
      const curLine = this.explorer.currentLineIndex;
      const sortedLines = mergeLines.sort((a, b) => b - a);
      const prevLine = sortedLines.find((line) => line < curLine);
      if (prevLine) {
        return prevLine;
      } else if (await enableWrapscan()) {
        return sortedLines[0];
      }
    }
    return null;
  }

  async nextLineIndex(...names: string[]): Promise<number | null> {
    let mergeLines: number[] = [];
    for (const name of names) {
      const lines = this.linesMap.get(name);
      mergeLines = mergeLines.concat(lines ? Array.from(lines) : []);
    }
    if (mergeLines.length) {
      const curLine = this.explorer.currentLineIndex;
      const sortedLines = mergeLines.sort((a, b) => a - b);
      const nextLine = sortedLines.find((line) => line > curLine);
      if (nextLine) {
        return nextLine;
      } else if (await enableWrapscan()) {
        return sortedLines[0];
      }
    }
    return null;
  }

  removeLines(lines: number[]): void;
  removeLines(startLine: number, endLine?: number): void;
  removeLines(startLineOrLines: number | number[], endLine: number = Infinity) {
    if (Array.isArray(startLineOrLines)) {
      this.linesMap.forEach((lines) => {
        startLineOrLines.forEach((line) => {
          lines.delete(line);
        });
      });
    } else {
      const startLine = startLineOrLines;
      this.linesMap.forEach((lines) => {
        lines.forEach((line) => {
          if (startLine <= line && line <= endLine) {
            lines.delete(line);
          }
        });
      });
    }
  }

  offsetLines(offset: number, startLine: number, endLine: number = Infinity) {
    if (offset === 0) {
      return;
    }
    this.linesMap.forEach((lines, name) => {
      const newLines = new Set<number>();
      lines.forEach((line) => {
        newLines.add(
          startLine <= line && line <= endLine ? line + offset : line,
        );
      });
      this.linesMap.set(name, newLines);
    });
  }
}
