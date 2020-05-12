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
  'vsplit',
  'tab',
  'previousBuffer',
  'previousWindow',
  'sourceWindow',
] as const;

export type OpenStrategy = typeof openStrategyList[number];

export const previewStrategyList = ['labeling'] as const;

export type PreviewStrategy = typeof previewStrategyList[number];
