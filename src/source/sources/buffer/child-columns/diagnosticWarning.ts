import { getDiagnosticDisplayMax } from '../../../../diagnostic/config';
import { diagnosticHighlights } from '../../../../diagnostic/highlights';
import { diagnosticManager } from '../../../../diagnostic/manager';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn(
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
                hl: diagnosticHighlights.diagnosticWarning,
              });
              return;
            }

            if (warningCount) {
              row.add(
                warningCount > diagnosticDisplayMax
                  ? '✗'
                  : warningCount.toString(),
                {
                  hl: diagnosticHighlights.diagnosticWarning,
                },
              );
              source.addIndexing('diagnosticWarning', nodeIndex);
            } else {
              source.removeIndexing('diagnosticWarning', nodeIndex);
            }
          },
        };
      },
    };
  },
);
