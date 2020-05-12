import { workspace, WorkspaceConfiguration } from 'coc.nvim';
import { generateUri } from './util';

export const config = workspace.getConfiguration('explorer');

export const configLocal = (resource: string = generateUri(workspace.cwd)) =>
  workspace.getConfiguration('explorer', resource);

export const getEnableDebug = () => config.get<boolean>('debug')!;

export type PreviewStrategy = 'labeling';

export function buildExplorerConfig(config: WorkspaceConfiguration) {
  return {
    get config() {
      return config;
    },
    get<T>(section: string, defaultValue?: T): T {
      return this.config.get<T>(section, defaultValue!)!;
    },
    get activeMode() {
      return this.config.get<boolean>('activeMode')!;
    },
    get autoReveal() {
      return this.config.get<boolean>('file.autoReveal')!;
    },
    get autoExpandRecursiveSingle() {
      return this.config.get<boolean>('autoExpandRecursiveSingle')!;
    },
    get autoExpandMaxDepth() {
      return this.config.get<number>('autoExpandMaxDepth')!;
    },
    get autoExpandCompactOrUncompact() {
      return this.config.get<boolean>('autoExpandCompactOrUncompact')!;
    },
    get autoCollapseRecursive() {
      return this.config.get<boolean>('autoCollapseRecursive')!;
    },
    get openActionForDirectory() {
      return this.config.get<string>('openAction.for.directory')!;
    },
    get openActionRelativePath() {
      return this.config.get<boolean>('openAction.relativePath')!;
    },
    get previewStrategy() {
      return this.config.get<PreviewStrategy>('previewAction.strategy')!;
    },
    get previewActionOnHover() {
      return this.config.get<boolean>('previewAction.onHover')!;
    },
    get datetimeFormat() {
      return this.config.get<string>('datetime.format')!;
    },
    get enableVimDevicons() {
      return this.config.get<boolean>('icon.enableVimDevicons')!;
    },
    get enableNerdfont() {
      return this.config.get<string>('icon.enableNerdfont')!;
    },
    get enableFloatingBorder() {
      return this.config.get<boolean>('floating.border.enable')!;
    },
    get floatingBorderChars() {
      return this.config.get<string[]>('floating.border.chars')!;
    },
    get floatingBorderTitle() {
      return this.config.get<string>('floating.border.title')!;
    },
  };
}

export type ExplorerConfig = ReturnType<typeof buildExplorerConfig>;
