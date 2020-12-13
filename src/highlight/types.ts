export interface HighlightPosition {
  group: string;
  start: number;
  size: number;
}

export interface HighlightPositionWithLine extends HighlightPosition {
  lineIndex: number;
}

export type HighlightCommand = {
  group: string;
  commands: string[];
};
