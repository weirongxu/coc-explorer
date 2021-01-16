import {
  getDiagnosticConfig,
  printDiagnosticCount,
} from '../../../../diagnostic/config';
import { diagnosticHighlights } from '../../../../diagnostic/highlights';
import { diagnosticManager } from '../../../../diagnostic/manager';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn(
  'child',
  'diagnosticError',
  ({ source, subscriptions }) => {
    const diagnosticConfig = getDiagnosticConfig(source.config);

    return {
      init() {
        subscriptions.push(diagnosticManager.bindColumn(source, ['error']));
      },
      draw() {
        return {
          labelVisible: ({ node }) =>
            !!diagnosticManager.getMixedError(node.fullpath),
          drawNode(row, { node, isLabeling }) {
            const errorCount = diagnosticManager.getMixedError(node.fullpath);

            if (isLabeling) {
              row.add((errorCount ?? 0).toString(), {
                hl: diagnosticHighlights.diagnosticError,
              });
              return;
            }
            if (!errorCount) {
              return;
            }
            row.add(printDiagnosticCount(errorCount, diagnosticConfig), {
              hl: diagnosticHighlights.diagnosticError,
            });
          },
        };
      },
    };
  },
);
