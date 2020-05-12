import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { diagnosticManager } from '../../../../diagnosticManager';
import { debounce } from '../../../../util';
import { fileHighlights } from '../fileSource';
import { onEvents } from '../../../../events';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticError',
  ({ source, subscriptions }) => {
    let cacheErrorMap = {} as Record<string, string>;

    return {
      init() {
        subscriptions.push(
          onEvents(
            'BufWritePost',
            debounce(1000, async () => {
              const diagnosticCountMax = source.config.get<number>(
                'file.diagnosticCountMax',
              )!;
              diagnosticManager.errorReload(source.root);

              const errorMixedCount = diagnosticManager.errorMixedCount;
              const localErrorMap: Record<string, string> = {};
              const prevErrorMap = cacheErrorMap;
              const updatePaths: Set<string> = new Set();
              for (const [fullpath, count] of Object.entries(errorMixedCount)) {
                const ch = count > diagnosticCountMax ? '✗' : count.toString();
                localErrorMap[fullpath] = ch;

                if (fullpath in prevErrorMap) {
                  if (prevErrorMap[fullpath] === ch) {
                    continue;
                  }
                  delete prevErrorMap[fullpath];
                  updatePaths.add(fullpath);
                } else {
                  updatePaths.add(fullpath);
                }
              }
              for (const [fullpath] of Object.keys(prevErrorMap)) {
                updatePaths.add(fullpath);
              }
              await source.renderPaths(updatePaths);
              cacheErrorMap = localErrorMap;
            }),
          ),
        );
      },
      reload() {
        diagnosticManager.errorReload(source.root);
      },
      draw() {
        return {
          labelVisible: ({ node }) => node.fullpath in cacheErrorMap,
          drawNode(row, { node, nodeIndex }) {
            if (node.fullpath in cacheErrorMap) {
              if (node.directory && source.nodeStores.isExpanded(node)) {
                source.removeIndexes('diagnosticError', nodeIndex);
              } else {
                const count = cacheErrorMap[node.fullpath];
                row.add(count, { hl: fileHighlights.diagnosticError });
                source.addIndexes('diagnosticError', nodeIndex);
              }
            } else {
              source.removeIndexes('diagnosticError', nodeIndex);
            }
          },
        };
      },
    };
  },
);
