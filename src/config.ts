import { workspace, WorkspaceConfiguration } from 'coc.nvim';
import { OriginalActionExp } from './actions/types';
import { CollapseOption, ExpandOption, RootStrategyStr } from './types';
import { Explorer } from './types/pkg-config';
import { generateUri } from './util';

export const config = workspace.getConfiguration('explorer');

export const configLocal = (resource: string = generateUri(workspace.cwd)) =>
  workspace.getConfiguration('explorer', resource);

export const getEnableDebug = () => config.get<boolean>('debug')!;

export interface ExplorerConfig {
  config: WorkspaceConfiguration;
  get(section: 'activeMode'): boolean;
  get(section: 'file.autoReveal'): boolean;
  get(section: 'file.revealWhenOpen'): boolean;
  get(section: 'autoExpandMaxDepth'): number;
  get(section: 'autoExpandOptions'): ExpandOption[];
  get(section: 'autoCollapseOptions'): CollapseOption[];
  get(section: 'openAction.for.directory'): OriginalActionExp;
  get(section: 'openAction.relativePath'): boolean;
  get(
    section: 'openAction.select.filter',
  ): NonNullable<Explorer['explorer.openAction.select.filter']>;
  get(
    section: 'previewAction.onHover',
  ): NonNullable<Explorer['explorer.previewAction.onHover']>;
  get(
    section: 'previewAction.content.maxHeight',
  ): NonNullable<Explorer['explorer.previewAction.content.maxHeight']>;
  get(section: 'datetime.format'): string;
  get(section: 'icon.enableVimDevicons'): boolean;
  get(section: 'icon.enableNerdfont'): boolean;
  get(section: 'floating.border.enable'): boolean;
  get(section: 'floating.border.chars'): string[];
  get(section: 'floating.border.title'): string;
  get(section: 'expandStores'): NonNullable<Explorer['explorer.expandStores']>;
  get(section: 'root.strategies'): NonNullable<RootStrategyStr[]>;
  get(
    section: 'root.customRules',
  ): NonNullable<Explorer['explorer.root.customRules']>;
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
