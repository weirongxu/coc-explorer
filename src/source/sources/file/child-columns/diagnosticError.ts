import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { diagnosticManager } from '../../../../diagnostic/manager';
import { getDiagnosticDisplayMax } from '../../../../diagnostic/config';
import { toSubscriptNumbers } from '../../../../util';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticError',
  ({ source, subscriptions }) => {
    const diagnosticDisplayMax = getDiagnosticDisplayMax(source.config);

    return {
      init() {
        subscriptions.push(diagnosticManager.bindColumn(source, ['error']));
      },
      draw() {
        return {
          labelVisible: ({ node }) =>
            !!diagnosticManager.getMixedError(node.fullpath),
          drawNode(row, { node, nodeIndex, isLabeling }) {
            const errorCount = diagnosticManager.getMixedError(node.fullpath);

            if (isLabeling) {
              row.add((errorCount ?? 0).toString(), {
                hl: fileHighlights.diagnosticError,
              });
              return;
            }

            if (errorCount) {
              if (node.directory && source.isExpanded(node)) {
                source.removeIndexing('diagnosticError', nodeIndex);
              } else {
                row.add(
                  errorCount > diagnosticDisplayMax
                    ? '✗'
                    : toSubscriptNumbers(errorCount),
                  { hl: fileHighlights.diagnosticError },
                );
                source.addIndexing('diagnosticError', nodeIndex);
              }
            } else {
              source.removeIndexing('diagnosticError', nodeIndex);
            }
          },
        };
      },
    };
  },
);
