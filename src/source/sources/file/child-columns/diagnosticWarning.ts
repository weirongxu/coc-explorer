import {
  getDiagnosticConfig,
  printDiagnosticCount,
} from '../../../../diagnostic/config';
import { diagnosticManager } from '../../../../diagnostic/manager';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticWarning',
  ({ source, subscriptions }) => {
    const diagnosticConfig = getDiagnosticConfig(source.config);

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
              if (node.directory && source.view.isExpanded(node)) {
                source.locator.mark.remove('diagnosticWarning', nodeIndex);
              } else {
                row.add(printDiagnosticCount(warningCount, diagnosticConfig), {
                  hl: fileHighlights.diagnosticWarning,
                });
                source.locator.mark.add('diagnosticWarning', nodeIndex);
              }
            } else {
              source.locator.mark.remove('diagnosticWarning', nodeIndex);
            }
          },
        };
      },
    };
  },
);
