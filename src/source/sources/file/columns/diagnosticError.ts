import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, debounce } from '../../../../util';
import { events } from 'coc.nvim';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
const errorMaxWidth = diagnosticCountMax.toString().length;

const highlights = {
  error: hlGroupManager.linkGroup('FileDiagnosticError', 'CocErrorSign'),
};

const concealable = hlGroupManager.concealable('FileDiagnosticError');

fileColumnRegistrar.registerColumn(
  'diagnosticError',
  (source, data) => ({
    concealable,
    init() {
      source.subscriptions.push(
        events.on(
          'BufWritePost',
          debounce(1000, async () => {
            diagnosticManager.errorReload(source.root);

            const errorMixedCount = diagnosticManager.errorMixedCount;
            const updatePaths: Set<string> = new Set();
            for (const [fullpath, count] of Object.entries(errorMixedCount)) {
              if (fullpath in data.prevDiagnosticError) {
                if (data.prevDiagnosticError[fullpath] === count) {
                  continue;
                }
                delete data.prevDiagnosticError[fullpath];
              } else {
                updatePaths.add(fullpath);
              }
            }
            for (const [fullpath] of Object.keys(data.prevDiagnosticError)) {
              updatePaths.add(fullpath);
            }
            await source.renderPaths(updatePaths);
            data.prevDiagnosticError = errorMixedCount;
          }),
        ),
      );
    },
    reload() {
      diagnosticManager.errorReload(source.root);
    },
    beforeDraw() {
      if (Object.keys(diagnosticManager.errorMixedCount).length) {
        this.concealable?.requestShow();
      } else {
        this.concealable?.requestHide();
      }
    },
    draw(row, node, { nodeIndex }) {
      if (node.fullpath in diagnosticManager.errorMixedCount) {
        if (node.directory && source.expandStore.isExpanded(node)) {
          row.add(' '.padStart(errorMaxWidth));
          source.removeIndexes('diagnosticError', nodeIndex);
        } else {
          const count = diagnosticManager.errorMixedCount[node.fullpath];
          row.add(count.padStart(errorMaxWidth), highlights.error);
          source.addIndexes('diagnosticError', nodeIndex);
        }
      } else {
        row.add(' '.repeat(errorMaxWidth));
        source.removeIndexes('diagnosticError', nodeIndex);
      }
      row.add(' ');
    },
  }),
  () => ({
    prevDiagnosticError: {} as Record<string, string>,
  }),
);
