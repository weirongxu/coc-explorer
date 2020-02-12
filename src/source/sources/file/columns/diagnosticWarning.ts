import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, debounce, onEvents } from '../../../../util';
import { fileHighlights } from '../file-source';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax', 99);
const warningMaxWidth = diagnosticCountMax.toString().length;

const concealable = hlGroupManager.concealable('FileDiagnosticWarning');

fileColumnRegistrar.registerColumn<{
  prevDiagnosticWarning: Record<string, string>;
}>('diagnosticWarning', ({ source, column }) => ({
  concealable: concealable(source),
  data: {
    prevDiagnosticWarning: {},
  },
  init() {
    source.subscriptions.push(
      onEvents(
        'BufWritePost',
        debounce(1000, async () => {
          diagnosticManager.warningReload(source.root);

          const warningMixedCount = diagnosticManager.warningMixedCount;
          const updatePaths: Set<string> = new Set();
          for (const [fullpath, count] of Object.entries(warningMixedCount)) {
            if (fullpath in column.data.prevDiagnosticWarning) {
              if (column.data.prevDiagnosticWarning[fullpath] === count) {
                continue;
              }
              delete column.data.prevDiagnosticWarning[fullpath];
            } else {
              updatePaths.add(fullpath);
            }
          }
          for (const [fullpath] of Object.keys(column.data.prevDiagnosticWarning)) {
            updatePaths.add(fullpath);
          }
          await source.renderPaths(updatePaths);
          column.data.prevDiagnosticWarning = warningMixedCount;
        }),
      ),
    );
  },
  reload() {
    diagnosticManager.warningReload(source.root);
  },
  beforeDraw() {
    if (Object.keys(diagnosticManager.warningMixedCount).length) {
      column.concealable.show();
    } else {
      column.concealable.hide();
    }
  },
  draw(row, node, { nodeIndex }) {
    if (node.fullpath in diagnosticManager.warningMixedCount) {
      if (node.directory && source.expandStore.isExpanded(node)) {
        row.add(' '.padStart(warningMaxWidth));
        source.removeIndexes('diagnosticWarning', nodeIndex);
      } else {
        const count = diagnosticManager.warningMixedCount[node.fullpath];
        row.add(count.padStart(warningMaxWidth), { hl: fileHighlights.diagnosticWarning });
        source.addIndexes('diagnosticWarning', nodeIndex);
      }
    } else {
      row.add(' '.repeat(warningMaxWidth));
      source.removeIndexes('diagnosticWarning', nodeIndex);
    }
  },
}));
