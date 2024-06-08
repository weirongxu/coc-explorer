import { workspace, type WorkspaceConfiguration } from 'coc.nvim';
import type { OriginalActionExp } from './actions/types';
import type { CollapseOption, ExpandOption, RootStrategyStr } from './types';
import type { Explorer } from './types/pkg-config';
import { generateUri, logger } from './util';

export const config = workspace.getConfiguration('explorer');

export const configLocal = (resource: string = generateUri(workspace.cwd)) =>
  workspace.getConfiguration('explorer', resource);

export const getEnableDebug = () => config.get<boolean>('debug')!;

export interface ExplorerConfig {
  config: WorkspaceConfiguration;
  get(section: 'file.reveal.auto'): boolean;
  get(section: 'file.reveal.whenOpen'): boolean;
  get(
    section: 'file.reveal.filter',
  ): NonNullable<Explorer['explorer.file.reveal.filter']>;
  get(section: 'autoExpandMaxDepth'): number;
  get(section: 'autoExpandOptions'): ExpandOption[] | undefined;
  get(section: 'autoCollapseOptions'): CollapseOption[];
  get(section: 'openAction.for.directory'): OriginalActionExp;
  get(section: 'openAction.relativePath'): boolean;
  get(
    section: 'openAction.select.filter',
  ): NonNullable<Explorer['explorer.openAction.select.filter']>;
  get(section: 'openAction.select.chars'): string;
  get(
    section: 'previewAction.onHover',
  ): NonNullable<Explorer['explorer.previewAction.onHover']>;
  get(
    section: 'previewAction.content.maxHeight',
  ): NonNullable<Explorer['explorer.previewAction.content.maxHeight']>;
  get(section: 'datetime.format'): string;
  get(section: 'icon.enableVimDevicons'): boolean;
  get(section: 'icon.enableNerdfont'): boolean;
  get(section: 'icon.source'): NonNullable<Explorer['explorer.icon.source']>;
  get(section: 'floating.border.enable'): boolean;
  get(section: 'floating.border.chars'): string[];
  get(section: 'floating.border.title'): string;
  get(
    section: 'expandStores',
    defaultValue?: Explorer['explorer.expandStores'],
  ): NonNullable<Explorer['explorer.expandStores']>;
  get(section: 'root.strategies'): NonNullable<RootStrategyStr[]>;
  get(
    section: 'root.customRules',
  ): NonNullable<Explorer['explorer.root.customRules']>;
  get(section: 'mapping.action.wait.timeout'): number;
  get<T = void>(section: string, defaultValue?: T): T;
}

export const bufferTabOnly = () => {
  return config.get<boolean>('buffer.tabOnly')!;
};

/**
 * @deprecated
 */
export const getRevealAuto = (config: ExplorerConfig) => {
  let revealAuto = config.get<boolean | undefined | null>('file.autoReveal');
  if (revealAuto !== undefined && revealAuto !== null) {
    logger.error(
      '`explorer.file.autoReveal` has been deprecated, please use explorer.file.reveal.auto instead of it',
    );
  } else {
    revealAuto = config.get('file.reveal.auto');
  }
  return revealAuto;
};

export const getRevealWhenOpen = (
  config: ExplorerConfig,
  revealWhenOpenArg: boolean | undefined,
) => {
  if (revealWhenOpenArg !== undefined) {
    return revealWhenOpenArg;
  }
  /**
   * @deprecated
   */
  let revealWhenOpen: boolean | undefined | null = config.get(
    'file.revealWhenOpen',
  );
  if (revealWhenOpen !== undefined && revealWhenOpen !== null) {
    logger.error(
      '`explorer.file.autoReveal` has been deprecated, please use explorer.file.reveal.whenOpen instead of it',
    );
  } else {
    revealWhenOpen = config.get('file.reveal.whenOpen');
  }
  return revealWhenOpen;
};

export function buildExplorerConfig(
  config: WorkspaceConfiguration,
): ExplorerConfig {
  return {
    get config() {
      return config;
    },
    get<T>(section: string, defaultValue?: T): T {
      return this.config.get<T>(section, defaultValue!);
    },
  };
}
