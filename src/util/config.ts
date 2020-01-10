import { workspace } from 'coc.nvim';

export const config = workspace.getConfiguration('explorer');

export const enableDebug = config.get<boolean>('debug')!;

export const activeMode = config.get<boolean>('activeMode')!;

export const autoReveal = config.get<boolean>('file.autoReveal')!;

export type OpenStrategy =
  | 'select'
  | 'vsplit'
  | 'previousBuffer'
  | 'previousWindow'
  | 'sourceWindow';
export const openStrategy = config.get<OpenStrategy>('openAction.strategy')!;

export type PreviewStrategy = 'labeling';
export const previewStrategy = config.get<PreviewStrategy>('previewAction.strategy')!;

export const datetimeFormat = config.get<string>('datetime.format')!;
