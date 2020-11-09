import { workspace } from 'coc.nvim';
import { config } from '../../config';
import { diagnosticManager } from '../../diagnostic/manager';
import { getGitHighlight } from '../../git/highlights';
import { gitManager } from '../../git/manager';
import { fileHighlights } from '../sources/file/fileSource';

export namespace FilenameHighlight {
  export type HighlightTypes = 'diagnosticError' | 'diagnosticWarning' | 'git';
}

class FilenameHighlight {
  config: {
    enabledGitStatus: boolean;
    enabledErrorStatus: boolean;
    enabledWarningStatus: boolean;
  };

  constructor() {
    let configKey: string;
    if (config.get<boolean>('file.filename.colored.enable') !== undefined) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        'explorer.file.filename.colored.enable has been deprecated, please use explorer.filename.colored.enable in coc-settings.json',
        'warning',
      );
      configKey = 'file.filename.colored.enable';
    } else {
      configKey = 'filename.colored.enable';
    }
    const enabledCompletely =
      config.get<boolean>(
        configKey,
        false,
        // This check because it might be an object, which is truthy
      ) === true;

    this.config = {
      enabledGitStatus:
        enabledCompletely || config.get<boolean>(configKey + '.git', false),
      enabledErrorStatus:
        enabledCompletely ||
        config.get<boolean>(configKey + '.diagnosticError', false),
      enabledWarningStatus:
        enabledCompletely ||
        config.get<boolean>(configKey + '.diagnosticWarning', false),
    };
  }

  getHighlight(
    fullpath: string,
    highlightOrder: FilenameHighlight.HighlightTypes[],
  ) {
    for (const type of highlightOrder) {
      if (type === 'diagnosticWarning') {
        if (this.config.enabledWarningStatus) {
          const warning = diagnosticManager.getMixedWarning(fullpath);
          if (warning) {
            return fileHighlights.diagnosticWarning;
          }
        }
      } else if (type === 'diagnosticError') {
        if (this.config.enabledErrorStatus) {
          const error = diagnosticManager.getMixedError(fullpath);
          if (error) {
            return fileHighlights.diagnosticError;
          }
        }
      } else if (type === 'git') {
        if (this.config.enabledGitStatus) {
          const status = gitManager.getMixedStatus(fullpath);
          if (status) {
            return getGitHighlight(status);
          }
        }
      }
    }
  }
}

export const filenameHighlight = new FilenameHighlight();
