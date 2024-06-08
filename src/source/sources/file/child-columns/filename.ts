import {
  diagnosticManager,
  type DiagnosticType,
} from '../../../../diagnostic/manager';
import { gitManager } from '../../../../git/manager';
import { FilenameHighlight } from '../../../../highlight/filename';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'filename',
  ({ source, subscriptions }) => {
    const filenameHighlight = new FilenameHighlight(source.config);

    const getHighlight = (fullpath: string, isDirectory: boolean) => {
      return (
        filenameHighlight.getHighlight(fullpath, isDirectory, [
          'diagnosticError',
          'diagnosticWarning',
          'git',
        ]) ?? (isDirectory ? fileHighlights.directory : fileHighlights.filename)
      );
    };

    const diagnosticTypes: DiagnosticType[] = [];
    if (filenameHighlight.enabledErrorStatus) {
      diagnosticTypes.push('error');
    }
    if (filenameHighlight.enabledWarningStatus) {
      diagnosticTypes.push('warning');
    }

    return {
      init() {
        subscriptions.push(
          diagnosticManager.bindColumn(source, diagnosticTypes),
          gitManager.bindColumn(source),
        );
      },
      draw() {
        return {
          async drawNode(row, { node }) {
            row.add(node.name, {
              hl: getHighlight(node.fullpath, node.directory),
              unicode: true,
            });
          },
        };
      },
    };
  },
);
