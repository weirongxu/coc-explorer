import { workspace } from 'coc.nvim';

export const config = workspace.getConfiguration('explorer');

export const enableDebug = config.get<boolean>('debug')!;

export const activeMode = config.get<boolean>('activeMode')!;

export const autoReveal = config.get<boolean>('file.autoReveal')!;

export const openStrategy = config.get<
  'select' | 'vsplit' | 'previousBuffer' | 'previousWindow' | 'originWindow'
>('openAction.strategy')!;

export const datetimeFormat = config.get<string>('datetime.format')!;
