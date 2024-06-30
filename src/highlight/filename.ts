import type { ExplorerConfig } from '../config';
import { diagnosticManager } from '../diagnostic/manager';
import { getGitFormatHighlight, gitHighlights } from '../git/highlights';
import { gitManager } from '../git/manager';
import { GitFormat, type GitMixedStatus } from '../git/types';
import { fileHighlights } from '../source/sources/file/fileSource';
import type { HighlightCommand } from './types';

export namespace FilenameHighlight {
  export type HighlightTypes = 'diagnosticError' | 'diagnosticWarning' | 'git';
}

export class FilenameHighlight {
  enabledGitStatus: boolean;

  enabledErrorStatus: boolean;
  enabledWarningStatus: boolean;

  constructor(config: ExplorerConfig) {
    const configKey = 'filename.colored.enable';
    const enabledCompletely =
      config.get<boolean>(
        configKey,
        false,
        // This check because it might be an object, which is truthy
      ) === true;

    this.enabledGitStatus =
      enabledCompletely || config.get<boolean>(`${configKey}.git`, false);
    this.enabledErrorStatus =
      enabledCompletely ||
      config.get<boolean>(`${configKey}.diagnosticError`, false);
    this.enabledWarningStatus =
      enabledCompletely ||
      config.get<boolean>(`${configKey}.diagnosticWarning`, false);
  }

  getGitHighlight(status: GitMixedStatus) {
    return status.x === GitFormat.ignored
      ? gitHighlights.ignored
      : getGitFormatHighlight(status.y);
  }

  getHighlight(
    fullpath: string,
    isDirectory: boolean,
    highlightOrder: FilenameHighlight.HighlightTypes[],
  ): HighlightCommand | undefined {
    for (const type of highlightOrder) {
      switch (type) {
        case 'diagnosticWarning':
          if (this.enabledWarningStatus) {
            const warning = diagnosticManager.getMixedWarning(fullpath);
            if (warning) {
              return fileHighlights.diagnosticWarning;
            }
          }
          break;
        case 'diagnosticError':
          if (this.enabledErrorStatus) {
            const error = diagnosticManager.getMixedError(fullpath);
            if (error) {
              return fileHighlights.diagnosticError;
            }
          }
          break;
        case 'git':
          if (this.enabledGitStatus) {
            const status = gitManager.getMixedStatus(fullpath, isDirectory);
            if (status) {
              return this.getGitHighlight(status);
            }
          }
          break;
      }
    }
  }
}
