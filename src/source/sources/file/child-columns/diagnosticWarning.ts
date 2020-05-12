import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { diagnosticManager } from '../../../../diagnosticManager';
import { debounce } from '../../../../util';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticWarning',
  ({ source, subscriptions }) => {
    const cache = {
      warningMap: {} as Record<string, string>,
    };

    const reload = async () => {
      const diagnosticCountMax = source.config.get<number>(
        'file.diagnosticCountMax',
        99,
      );

      const warningMixedCount = diagnosticManager.getMixedWarning(source.root);
      const localWarningMap: Record<string, string> = {};
      const prevWarningMap = cache.warningMap;
      const updatePaths: Set<string> = new Set();
      for (const [fullpath, count] of Object.entries(warningMixedCount)) {
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
      for (const fullpath of Object.keys(prevWarningMap)) {
        updatePaths.add(fullpath);
      }
      cache.warningMap = localWarningMap;
      await source.renderPaths(updatePaths);
    };

    return {
      init() {
        subscriptions.push(diagnosticManager.onChange(debounce(1000, reload)));
      },
      reload() {
        return reload();
      },
      draw() {
        return {
          labelVisible: ({ node }) => node.fullpath in cache.warningMap,
          drawNode(row, { node, nodeIndex }) {
            if (node.fullpath in cache.warningMap) {
              if (node.directory && source.isExpanded(node)) {
                source.removeIndexes('diagnosticWarning', nodeIndex);
              } else {
                const count = cache.warningMap[node.fullpath];
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
