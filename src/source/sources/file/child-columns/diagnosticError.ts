import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, debounce, onEvents } from '../../../../util';
import { fileHighlights } from '../file-source';

const concealable = hlGroupManager.concealable('FileDiagnosticError');

fileColumnRegistrar.registerColumn<{
  errorMap: Record<string, string>;
}>('child', 'diagnosticError', ({ source, column }) => ({
  concealable: concealable(source),
  data: {
    errorMap: {},
  },
  labelVisible: (node) => node.fullpath in column.data.errorMap,
  init() {
    source.subscriptions.push(
      onEvents(
        'BufWritePost',
        debounce(1000, async () => {
          const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
          diagnosticManager.errorReload(source.root);

          const errorMixedCount = diagnosticManager.errorMixedCount;
          const errorMap: Record<string, string> = {};
          const prevErrorMap = column.data.errorMap;
          const updatePaths: Set<string> = new Set();
          for (const [fullpath, count] of Object.entries(errorMixedCount)) {
            const ch = count > diagnosticCountMax ? '✗' : count.toString();
            errorMap[fullpath] = ch;

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
          column.data.errorMap = errorMap;
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
    const errorMap = column.data.errorMap;
    if (node.fullpath in errorMap) {
      if (node.directory && source.expandStore.isExpanded(node)) {
        source.removeIndexes('diagnosticError', nodeIndex);
      } else {
        const count = errorMap[node.fullpath];
        row.add(count, { hl: fileHighlights.diagnosticError });
        source.addIndexes('diagnosticError', nodeIndex);
      }
    } else {
      source.removeIndexes('diagnosticError', nodeIndex);
    }
  },
}));
