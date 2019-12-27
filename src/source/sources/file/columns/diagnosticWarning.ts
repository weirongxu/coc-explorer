import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { diagnosticManager } from '../../../../diagnostic-manager';
import { config, debounce } from '../../../../util';
import { events } from 'coc.nvim';

const diagnosticCountMax = config.get<number>('file.diagnosticCountMax')!;
const warningMaxWidth = diagnosticCountMax.toString().length;

const highlights = {
  warning: hlGroupManager.linkGroup('FileDiagnosticWarning', 'CocWarningSign'),
};

const concealable = hlGroupManager.concealable('FileDiagnosticWarning');

fileColumnRegistrar.registerColumn(
  'diagnosticWarning',
  (source, data) => ({
    concealable,
    init() {
      source.subscriptions.push(
        events.on(
          'BufWritePost',
          debounce(1000, async () => {
            diagnosticManager.warningReload(source.root);

            const warningMixedCount = diagnosticManager.warningMixedCount;
            const updatePaths: Set<string> = new Set();
            for (const [fullpath, count] of Object.entries(warningMixedCount)) {
              if (fullpath in data.prevDiagnosticWarning) {
                if (data.prevDiagnosticWarning[fullpath] === count) {
                  continue;
                }
                delete data.prevDiagnosticWarning[fullpath];
              } else {
                updatePaths.add(fullpath);
              }
            }
            for (const [fullpath] of Object.keys(data.prevDiagnosticWarning)) {
              updatePaths.add(fullpath);
            }
            await source.renderPaths(updatePaths);
            data.prevDiagnosticWarning = warningMixedCount;
          }),
        ),
      );
    },
    reload() {
      diagnosticManager.warningReload(source.root);
    },
    beforeDraw() {
      if (Object.keys(diagnosticManager.warningMixedCount).length) {
        this.concealable?.requestShow();
      } else {
        this.concealable?.requestHide();
      }
    },
    draw(row, node, nodeIndex) {
      if (node.fullpath in diagnosticManager.warningMixedCount) {
        if (node.directory && source.expandStore.isExpanded(node)) {
          row.add(' '.padStart(warningMaxWidth));
          source.removeIndexes('diagnosticWarning', nodeIndex);
        } else {
          const count = diagnosticManager.warningMixedCount[node.fullpath];
          row.add(count.padStart(warningMaxWidth), highlights.warning);
          source.addIndexes('diagnosticWarning', nodeIndex);
        }
      } else {
        row.add(' '.repeat(warningMaxWidth));
        source.removeIndexes('diagnosticWarning', nodeIndex);
      }
      row.add(' ');
    },
  }),
  () => ({
    prevDiagnosticWarning: {} as Record<string, string>,
  }),
);
