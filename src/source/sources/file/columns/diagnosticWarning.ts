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

fileColumnRegistrar.registerColumn('diagnosticWarning', (source) => ({
  concealable,
  init() {
    let prevWarningMixedCount: Record<string, string> = {};

    events.on(
      ['InsertLeave', 'TextChanged'],
      debounce(1000, async () => {
        diagnosticManager.warningReload(source.root);

        if (diagnosticManager.warningNeedRender) {
          diagnosticManager.warningNeedRender = false;
          const warningMixedCount = diagnosticManager.warningMixedCount;
          const updatePaths: Set<string> = new Set();
          for (const [fullpath, count] of Object.entries(warningMixedCount)) {
            if (fullpath in prevWarningMixedCount) {
              if (prevWarningMixedCount[fullpath] === count) {
                continue;
              }
              delete prevWarningMixedCount[fullpath];
            } else {
              updatePaths.add(fullpath);
            }
          }
          for (const [fullpath] of Object.keys(prevWarningMixedCount)) {
            updatePaths.add(fullpath);
          }
          await source.renderPaths(updatePaths);
          prevWarningMixedCount = warningMixedCount;
        }
      }),
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
}));
