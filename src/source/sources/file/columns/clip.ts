import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';
import { enableNerdfont } from '../../../source';
import { max } from '../../../../util';

let copy = fileColumnManager.getColumnConfig<string>('clip.copy');
let cut = fileColumnManager.getColumnConfig<string>('clip.cut');
if (enableNerdfont) {
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
const width = max([copy.length, cut.length]) + 1;
copy = copy.padEnd(width, ' ');
cut = cut.padEnd(width, ' ');
const space = ' '.repeat(width);

const highlights = {
  clip: hlGroupManager.hlLinkGroupCommand('FileClip', 'Statement'),
};

const hlColumn = hlGroupManager.hlColumnHide('FileClip');

fileColumnManager.registerColumn('clip', (source) => ({
  async beforeDraw() {
    if (source.copiedNodes.size === 0 && source.cutNodes.size === 0) {
      await hlColumn.hide();
    } else {
      await hlColumn.show();
    }
  },
  draw(row, node) {
    row.addColumn(hlColumn, () => {
      const chars = source.copiedNodes.has(node) ? copy : source.cutNodes.has(node) ? cut : space;
      row.add(chars, highlights.clip);
    });
  },
}));
