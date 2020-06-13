import { workspace, WorkspaceConfiguration } from 'coc.nvim';
import { generateUri } from './util';
import { PreviewStrategy, ExpandOption, CollapseOption } from './types';

export const config = workspace.getConfiguration('explorer');

export const configLocal = (resource: string = generateUri(workspace.cwd)) =>
  workspace.getConfiguration('explorer', resource);

export const getEnableDebug = () => config.get<boolean>('debug')!;

export interface ExplorerConfig {
  config: WorkspaceConfiguration;
  get(section: 'activeMode'): boolean;
  get(section: 'file.autoReveal'): boolean;
  get(section: 'autoExpandMaxDepth'): number;
  get(section: 'autoExpandOptions'): ExpandOption[];
  get(section: 'autoCollapseOptions'): CollapseOption[];
  get(section: 'openAction.for.directory'): string;
  get(section: 'openAction.relativePath'): boolean;
  get(section: 'previewAction.strategy'): PreviewStrategy;
  get(section: 'previewAction.onHover'): boolean;
  get(section: 'datetime.format'): string;
  get(section: 'icon.enableVimDevicons'): boolean;
  get(section: 'icon.enableNerdfont'): boolean;
  get(section: 'floating.border.enable'): boolean;
  get(section: 'floating.border.chars'): string[];
  get(section: 'floating.border.title'): string;
  get<T = void>(section: string, defaultValue?: T): T;
}

export function buildExplorerConfig(
  config: WorkspaceConfiguration,
): ExplorerConfig {
  return {
    get config() {
      return config;
    },
    get<T>(section: string, defaultValue?: T): T {
      return this.config.get<T>(section, defaultValue!)!;
    },
  };
}
