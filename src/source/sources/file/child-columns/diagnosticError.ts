import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { diagnosticManager } from '../../../../diagnosticManager';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticError',
  ({ source, subscriptions }) => {
    const diagnosticCountMax = source.config.get<number>(
      'file.diagnosticCountMax',
    )!;

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
                  errorCount > diagnosticCountMax ? '✗' : errorCount.toString(),
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
