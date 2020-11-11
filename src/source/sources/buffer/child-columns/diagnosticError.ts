import { getDiagnosticDisplayMax } from '../../../../diagnostic/config';
import { diagnosticHighlights } from '../../../../diagnostic/highlights';
import { diagnosticManager } from '../../../../diagnostic/manager';
import { toSubscriptNumbers } from '../../../../util';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn(
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
                hl: diagnosticHighlights.diagnosticError,
              });
              return;
            }

            if (errorCount) {
              row.add(
                errorCount > diagnosticDisplayMax
                  ? '✗'
                  : toSubscriptNumbers(errorCount),
                { hl: diagnosticHighlights.diagnosticError },
              );
              source.addIndexing('diagnosticError', nodeIndex);
            } else {
              source.removeIndexing('diagnosticError', nodeIndex);
            }
          },
        };
      },
    };
  },
);
