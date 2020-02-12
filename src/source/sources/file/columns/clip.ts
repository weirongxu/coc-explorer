import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { max, getEnableNerdfont } from '../../../../util';
import { fileHighlights } from '../file-source';

let copy = fileColumnRegistrar.getColumnConfig<string>('clip.copy');
let cut = fileColumnRegistrar.getColumnConfig<string>('clip.cut');
if (getEnableNerdfont()) {
  if (copy === undefined) {
    copy = '';
  }
  if (cut === undefined) {
    cut = '';
  }
} else {
  if (copy === undefined) {
    copy = 'C';
  }
  if (cut === undefined) {
    cut = 'X';
  }
}
const width = max([copy.length, cut.length]);
copy = copy.padEnd(width, ' ');
cut = cut.padEnd(width, ' ');
const space = ' '.repeat(width);

const concealable = hlGroupManager.concealable('FileClip');

fileColumnRegistrar.registerColumn('clip', ({ source, column }) => ({
  concealable: concealable(source),
  async beforeDraw() {
    if (source.copiedNodes.size === 0 && source.cutNodes.size === 0) {
      column.concealable.hide();
    } else {
      column.concealable.show();
    }
  },
  draw(row, node) {
    const chars = source.copiedNodes.has(node) ? copy : source.cutNodes.has(node) ? cut : space;
    row.add(chars, { hl: fileHighlights.clip });
  },
}));
