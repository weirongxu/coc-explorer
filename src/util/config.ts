import { workspace } from 'coc.nvim';
import { generateUri } from './uri';

export const config = workspace.getConfiguration(
  'explorer',
  generateUri(workspace.cwd, 'file'),
);

export const configLocal = (resource: string) =>
  workspace.getConfiguration('explorer', resource);

export const getEnableDebug = () => config.get<boolean>('debug')!;

export type PreviewStrategy = 'labeling';
export const getPreviewStrategy = () =>
  config.get<PreviewStrategy>('previewAction.strategy')!;

export const getEnableFloatingBorder = () =>
  config.get<boolean>('floating.border.enable')!;

export const getFloatingBorderChars = () =>
  config.get<string[]>('floating.border.chars')!;

export const getFloatingBorderTitle = () =>
  config.get<string>('floating.border.title')!;
