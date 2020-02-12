import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, debounce, onEvents } from '../../../../util';
import { fileHighlights } from '../file-source';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax', 99);
const errorMaxWidth = diagnosticCountMax.toString().length;

const concealable = hlGroupManager.concealable('FileDiagnosticError');

fileColumnRegistrar.registerColumn<{
  prevDiagnosticError: Record<string, string>;
}>('diagnosticError', ({ source, column }) => ({
  concealable: concealable(source),
  data: {
    prevDiagnosticError: {},
  },
  init() {
    source.subscriptions.push(
      onEvents(
        'BufWritePost',
        debounce(1000, async () => {
          diagnosticManager.errorReload(source.root);

          const errorMixedCount = diagnosticManager.errorMixedCount;
          const updatePaths: Set<string> = new Set();
          for (const [fullpath, count] of Object.entries(errorMixedCount)) {
            if (fullpath in column.data.prevDiagnosticError) {
              if (column.data.prevDiagnosticError[fullpath] === count) {
                continue;
              }
              delete column.data.prevDiagnosticError[fullpath];
            } else {
              updatePaths.add(fullpath);
            }
          }
          for (const [fullpath] of Object.keys(column.data.prevDiagnosticError)) {
            updatePaths.add(fullpath);
          }
          await source.renderPaths(updatePaths);
          column.data.prevDiagnosticError = errorMixedCount;
        }),
      ),
    );
  },
  reload() {
    diagnosticManager.errorReload(source.root);
  },
  beforeDraw() {
    if (Object.keys(diagnosticManager.errorMixedCount).length) {
      column.concealable.show();
    } else {
      column.concealable.hide();
    }
  },
  draw(row, node, { nodeIndex }) {
    if (node.fullpath in diagnosticManager.errorMixedCount) {
      if (node.directory && source.expandStore.isExpanded(node)) {
        row.add(' '.padStart(errorMaxWidth));
        source.removeIndexes('diagnosticError', nodeIndex);
      } else {
        const count = diagnosticManager.errorMixedCount[node.fullpath];
        row.add(count.padStart(errorMaxWidth), { hl: fileHighlights.diagnosticError });
        source.addIndexes('diagnosticError', nodeIndex);
      }
    } else {
      row.add(' '.repeat(errorMaxWidth));
      source.removeIndexes('diagnosticError', nodeIndex);
    }
  },
}));
