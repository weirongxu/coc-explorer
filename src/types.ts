import { SetRequired } from 'type-fest';

export const moveStrategyList = ['default', 'insideSource'] as const;

export type MoveStrategy = typeof moveStrategyList[number];

export const revealStrategyList = [
  'select',
  'previousBuffer',
  'previousWindow',
  'sourceWindow',
  'path',
] as const;

export type RevealStrategy = typeof revealStrategyList[number];

export const openStrategyList = [
  'select',
  'split',
  'split:plain',
  'split:intelligent',
  'vsplit',
  'vsplit:plain',
  'vsplit:intelligent',
  'tab',
  'previousBuffer',
  'previousWindow',
  'sourceWindow',
] as const;

export type OpenStrategy = typeof openStrategyList[number];

export const previewStrategyList = ['labeling'] as const;

export type PreviewStrategy = typeof previewStrategyList[number];

export const expandOptionList = [
  'recursive',
  'compact',
  'uncompact',
  'recursiveSingle',
] as const;

export type ExpandOption = typeof expandOptionList[number];

export const collapseOptionList = ['recursive', 'all'] as const;

export type CollapseOption = typeof collapseOptionList[number];

export type ExplorerOpenOptions = {
  width: number;
  height: number;
  /**
   * left position
   */
  left: number;
  /**
   * top position
   */
  top: number;
  border_bufnr?: number;
  border_enable: boolean;
  border_chars: string[];
  /**
   * buffer name
   */
  name?: string;
  /**
   * float win title
   */
  title: string;
  filetype?: string;
  focus?: boolean;
};

export type FloatingCreateOptions = {
  /**
   * buffer name
   */
  name?: string;
};

export type FloatingOpenOptions = SetRequired<ExplorerOpenOptions, 'filetype'>;
