import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { diagnosticManager } from '../../../../diagnosticManager';
import { config, debounce, onEvents } from '../../../../util';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticWarning',
  ({ source, subscriptions }) => {
    let cacheWarningMap = {} as Record<string, string>;

    return {
      init() {
        subscriptions.push(
          onEvents(
            'BufWritePost',
            debounce(1000, async () => {
              const diagnosticCountMax = config.get<number>(
                'file.diagnosticCountMax',
                99,
              );
              diagnosticManager.warningReload(source.root);

              const warningMixedCount = diagnosticManager.warningMixedCount;
              const localWarningMap: Record<string, string> = {};
              const prevWarningMap = cacheWarningMap;
              const updatePaths: Set<string> = new Set();
              for (const [fullpath, count] of Object.entries(
                warningMixedCount,
              )) {
                const ch = count > diagnosticCountMax ? '✗' : count.toString();
                localWarningMap[fullpath] = ch;

                if (fullpath in prevWarningMap) {
                  if (prevWarningMap[fullpath] === ch) {
                    continue;
                  }
                  delete prevWarningMap[fullpath];
                } else {
                  updatePaths.add(fullpath);
                }
              }
              for (const [fullpath] of Object.keys(prevWarningMap)) {
                updatePaths.add(fullpath);
              }
              await source.renderPaths(updatePaths);
              cacheWarningMap = localWarningMap;
            }),
          ),
        );
      },
      reload() {
        diagnosticManager.warningReload(source.root);
      },
      draw() {
        return {
          labelVisible: ({ node }) => node.fullpath in cacheWarningMap,
          drawNode(row, { node, nodeIndex }) {
            if (node.fullpath in cacheWarningMap) {
              if (node.directory && source.expandStore.isExpanded(node)) {
                source.removeIndexes('diagnosticWarning', nodeIndex);
              } else {
                const count = cacheWarningMap[node.fullpath];
                row.add(count, { hl: fileHighlights.diagnosticWarning });
                source.addIndexes('diagnosticWarning', nodeIndex);
              }
            } else {
              source.removeIndexes('diagnosticWarning', nodeIndex);
            }
          },
        };
      },
    };
  },
);
