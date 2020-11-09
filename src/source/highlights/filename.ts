import { config } from '../../config';
import { diagnosticManager } from '../../diagnosticManager';
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
    // TODO change to filename.colored.enable
    const enabledCompletely =
      config.get<boolean>(
        'file.filename.colored.enable',
        false,
        // This check because it might be an object, which is truthy
      ) === true;

    this.config = {
      enabledGitStatus:
        enabledCompletely ||
        config.get<boolean>('file.filename.colored.enable.git', false),
      enabledErrorStatus:
        enabledCompletely ||
        config.get<boolean>(
          'file.filename.colored.enable.diagnosticError',
          false,
        ),
      enabledWarningStatus:
        enabledCompletely ||
        config.get<boolean>(
          'file.filename.colored.enable.diagnosticWarning',
          false,
        ),
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
