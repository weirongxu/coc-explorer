import type { HighlightPosition } from '../highlight/types';
import type { NodeUid } from '../source/source';
import type { ViewRowPainter } from '../source/viewPainter';

// Flexible types
export type DrawFlexiblePosition = 'left' | 'right' | 'center';

export type DrawFlexible = {
  padding?: DrawFlexiblePosition;
  paddingVolume?: number;
  grow?: DrawFlexiblePosition;
  growVolume?: number;
  omit?: DrawFlexiblePosition;
  omitVolume?: number;
};

// Draw types
export type DrawBlock = (row: ViewRowPainter) => void | Promise<void>;

export type DrawContent = {
  type: 'content';
  content: string;
  /**
   * Calculate width via `workspace.nvim.strWidth()` when unicode is true
   */
  unicode?: boolean;
  width?: number;
  group?: string;
};

export type DrawGroup = {
  type: 'group';
  contents: DrawContent[];
  flexible?: DrawFlexible;
};

export type Drawable = DrawContent | DrawGroup;

export interface DrawContentWithWidth extends DrawContent {
  width: number;
}

export interface DrawGroupWithWidth extends DrawGroup {
  contents: DrawContentWithWidth[];
}

export type DrawableWithWidth = DrawContentWithWidth | DrawGroupWithWidth;

// Drawn types
export interface Drawn {
  highlightPositions: HighlightPosition[];
  content: string;
}

export type DrawnWithNodeIndex = {
  nodeIndex: number;
  nodeUid: NodeUid;
  highlightPositions: HighlightPosition[];
  content: string;
};

export type DrawnWithIndexRange = {
  nodeIndexStart: number;
  nodeIndexEnd: number;
  drawnList: DrawnWithNodeIndex[];
};
