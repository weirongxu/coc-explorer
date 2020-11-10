import pathLib from 'path';
import {
  diagnosticManager,
  DiagnosticType,
} from '../../../../diagnostic/manager';
import { gitManager } from '../../../../git/manager';
import { FilenameHighlight } from '../../../highlights/filename';
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
