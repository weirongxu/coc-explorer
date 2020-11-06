import pathLib from 'path';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { getGitHighlight } from '../../../../git/highlights';
import { gitManager } from '../../../../git/manager';
import {
  diagnosticManager,
  DiagnosticType,
} from '../../../../diagnosticManager';

fileColumnRegistrar.registerColumn(
  'child',
  'filename',
  ({ source, subscriptions }) => {
    const enabledCompletely =
      source.config.get<boolean>(
        'file.filename.colored.enable',
        false,
        // This check because it might be an object, which is truthy
      ) === true;

    const enabledGitStatus =
      source.config.get<boolean>('file.filename.colored.enable.git', false) ||
      enabledCompletely;

    const enabledWarnStatus =
      source.config.get<boolean>(
        'file.filename.colored.enable.diagnosticWarning',
        false,
      ) || enabledCompletely;

    const enabledErrorStatus =
      source.config.get<boolean>(
        'file.filename.colored.enable.diagnosticError',
        false,
      ) || enabledCompletely;

    const getHighlight = (fullpath: string, isDirectory: boolean) => {
      if (enabledErrorStatus) {
        const error = diagnosticManager.getMixedError(fullpath);
        if (error) {
          return fileHighlights.diagnosticError;
        }
      }
      if (enabledWarnStatus) {
        const warning = diagnosticManager.getMixedWarning(fullpath);
        if (warning) {
          return fileHighlights.diagnosticWarning;
        }
      }
      if (enabledGitStatus) {
        const status = gitManager.getMixedStatus(fullpath);
        if (status) {
          return getGitHighlight(status);
        }
      }
      return isDirectory ? fileHighlights.directory : fileHighlights.filename;
    };

    const diagnosticTypes: DiagnosticType[] = [];
    if (enabledErrorStatus) {
      diagnosticTypes.push('error');
    }
    if (enabledWarnStatus) {
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
            if (node.directory) {
              const compactStore = source.getCompact(node);
              if (node.compacted && compactStore?.status === 'compacted') {
                row.add(
                  compactStore.nodes.map((n) => n.name).join(pathLib.sep),
                  {
                    hl: getHighlight(node.fullpath, true),
                    unicode: true,
                  },
                );
              } else {
                row.add(node.name, {
                  hl: getHighlight(node.fullpath, true),
                  unicode: true,
                });
              }
            } else {
              row.add(node.name, {
                hl: getHighlight(node.fullpath, false),
                unicode: true,
              });
            }
          },
        };
      },
    };
  },
);
