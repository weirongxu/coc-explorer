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
          drawNode(row, { node, isLabeling }) {
            const warningCount = diagnosticManager.getMixedWarning(
              node.fullpath,
            );

            if (isLabeling) {
              row.add((warningCount ?? 0).toString(), {
                hl: fileHighlights.diagnosticWarning,
              });
              return;
            }
            if (!warningCount) {
              return;
            }
            if (node.expandable && source.view.isExpanded(node)) {
              return;
            }
            row.add(printDiagnosticCount(warningCount, diagnosticConfig), {
              hl: fileHighlights.diagnosticWarning,
            });
          },
        };
      },
    };
  },
);
