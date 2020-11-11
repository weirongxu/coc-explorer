import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { diagnosticManager } from '../../../../diagnostic/manager';
import { getDiagnosticDisplayMax } from '../../../../diagnostic/config';
import { toSubscriptNumbers } from '../../../../util';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticWarning',
  ({ source, subscriptions }) => {
    const diagnosticDisplayMax = getDiagnosticDisplayMax(source.config);

    return {
      init() {
        subscriptions.push(diagnosticManager.bindColumn(source, ['warning']));
      },
      draw() {
        return {
          labelVisible: ({ node }) =>
            !!diagnosticManager.getMixedWarning(node.fullpath),
          drawNode(row, { node, nodeIndex, isLabeling }) {
            const warningCount = diagnosticManager.getMixedWarning(
              node.fullpath,
            );

            if (isLabeling) {
              row.add((warningCount ?? 0).toString(), {
                hl: fileHighlights.diagnosticWarning,
              });
              return;
            }

            if (warningCount) {
              if (node.directory && source.isExpanded(node)) {
                source.removeIndexing('diagnosticWarning', nodeIndex);
              } else {
                row.add(
                  warningCount > diagnosticDisplayMax
                    ? '✗'
                    : toSubscriptNumbers(warningCount),
                  {
                    hl: fileHighlights.diagnosticWarning,
                  },
                );
                source.addIndexing('diagnosticWarning', nodeIndex);
              }
            } else {
              source.removeIndexing('diagnosticWarning', nodeIndex);
            }
          },
        };
      },
    };
  },
);
