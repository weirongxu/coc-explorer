export interface HighlightPosition {
  /**
   * highlight group
   */
  group: string;

  /**
   * highlight start index, start by 0
   */
  start: number;

  /**
   * highlight size
   */
  size: number;
}

export interface HighlightPositionWithLine extends HighlightPosition {
  /**
   * highlight line index, start by 0
   */
  lineIndex: number;
}

export type HighlightCommand = {
  /**
   * highlight group
   */
  group: string;

  /**
   * highlight commands, execute to register the vim syntax
   */
  commands: string[];
};
