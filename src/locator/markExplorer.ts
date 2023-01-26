import type { Explorer } from '../explorer';
import { enableWrapscan } from '../util';

export class MarkExplorer {
  marksGroupByType: Map<string, Set<number>> = new Map();

  constructor(public readonly explorer: Explorer) {}

  add(type: string, lineIndex: number) {
    if (!this.marksGroupByType.has(type)) {
      this.marksGroupByType.set(type, new Set<number>());
    }
    const lines = this.marksGroupByType.get(type)!;
    lines.add(lineIndex);
  }

  remove(type: string, lineIndex: number) {
    if (!this.marksGroupByType.has(type)) {
      this.marksGroupByType.set(type, new Set<number>());
    }
    const lines = this.marksGroupByType.get(type)!;
    lines.delete(lineIndex);
  }

  removeAll() {
    this.marksGroupByType.clear();
  }

  removeLines(lines: number[]): void;
  removeLines(startLine: number, endLine?: number): void;
  removeLines(startLineOrLines: number | number[], endLine = Infinity) {
    if (Array.isArray(startLineOrLines)) {
      this.marksGroupByType.forEach((lines) => {
        startLineOrLines.forEach((line) => {
          lines.delete(line);
        });
      });
    } else {
      const startLine = startLineOrLines;
      this.marksGroupByType.forEach((lines) => {
        lines.forEach((line) => {
          if (startLine <= line && line <= endLine) {
            lines.delete(line);
          }
        });
      });
    }
  }

  offsetLines(offset: number, startLine: number, endLine = Infinity) {
    if (offset === 0) {
      return;
    }
    this.marksGroupByType.forEach((lines, name) => {
      const newLines = new Set<number>();
      lines.forEach((line) => {
        newLines.add(
          startLine <= line && line <= endLine ? line + offset : line,
        );
      });
      this.marksGroupByType.set(name, newLines);
    });
  }

  async prevLineIndex(...names: string[]): Promise<number | undefined> {
    let mergeLines: number[] = [];
    for (const name of names) {
      const lines = this.marksGroupByType.get(name);
      mergeLines = mergeLines.concat(lines ? Array.from(lines) : []);
    }
    if (mergeLines.length) {
      const curLine = this.explorer.view.currentLineIndex;
      const sortedLines = mergeLines.sort((a, b) => b - a);
      const prevLine = sortedLines.find((line) => line < curLine);
      if (prevLine) {
        return prevLine;
      } else if (await enableWrapscan()) {
        return sortedLines[0];
      }
    }
  }

  async nextLineIndex(...names: string[]): Promise<number | undefined> {
    let mergeLines: number[] = [];
    for (const name of names) {
      const lines = this.marksGroupByType.get(name);
      mergeLines = mergeLines.concat(lines ? Array.from(lines) : []);
    }
    if (mergeLines.length) {
      const curLine = this.explorer.view.currentLineIndex;
      const sortedLines = mergeLines.sort((a, b) => a - b);
      const nextLine = sortedLines.find((line) => line > curLine);
      if (nextLine) {
        return nextLine;
      } else if (await enableWrapscan()) {
        return sortedLines[0];
      }
    }
  }
}
