import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { diagnosticManager } from '../../../../diagnosticManager';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticWarning',
  ({ source, subscriptions }) => {
    const diagnosticCountMax = source.config.get<number>(
      'file.diagnosticCountMax',
    )!;

    return {
      init() {
        subscriptions.push(diagnosticManager.bindColumn(source, ['warning']));
      },
      draw() {
        return {
          labelVisible: ({ node }) =>
            !!diagnosticManager.getMixedWarning(node.fullpath),
          drawNode(row, { node, nodeIndex }) {
            const warningCount = diagnosticManager.getMixedWarning(
              node.fullpath,
            );
            if (warningCount) {
              if (node.directory && source.isExpanded(node)) {
                source.removeIndexing('diagnosticWarning', nodeIndex);
              } else {
                row.add(
                  warningCount > diagnosticCountMax
                    ? '✗'
                    : warningCount.toString(),
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
