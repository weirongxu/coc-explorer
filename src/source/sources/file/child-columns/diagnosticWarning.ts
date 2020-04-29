import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { diagnosticManager } from '../../../../diagnosticManager';
import { config, debounce, onEvents } from '../../../../util';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn<{
  warningMap: Record<string, string>;
}>('child', 'diagnosticWarning', ({ source, column }) => ({
  data: {
    warningMap: {},
  },
  labelVisible: (node) => node.fullpath in column.data.warningMap,
  init() {
    source.subscriptions.push(
      onEvents(
        'BufWritePost',
        debounce(1000, async () => {
          const diagnosticCountMax = config.get<number>('file.diagnosticCountMax', 99);
          diagnosticManager.warningReload(source.root);

          const warningMixedCount = diagnosticManager.warningMixedCount;
          const warningMap: Record<string, string> = {};
          const prevWarningMap = column.data.warningMap;
          const updatePaths: Set<string> = new Set();
          for (const [fullpath, count] of Object.entries(warningMixedCount)) {
            const ch = count > diagnosticCountMax ? '✗' : count.toString();
            warningMap[fullpath] = ch;

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
          column.data.warningMap = warningMap;
        }),
      ),
    );
  },
  reload() {
    diagnosticManager.warningReload(source.root);
  },
  draw(row, node, { nodeIndex }) {
    const warningMap = column.data.warningMap;
    if (node.fullpath in warningMap) {
      if (node.directory && source.expandStore.isExpanded(node)) {
        source.removeIndexes('diagnosticWarning', nodeIndex);
      } else {
        const count = warningMap[node.fullpath];
        row.add(count, { hl: fileHighlights.diagnosticWarning });
        source.addIndexes('diagnosticWarning', nodeIndex);
      }
    } else {
      source.removeIndexes('diagnosticWarning', nodeIndex);
    }
  },
}));
