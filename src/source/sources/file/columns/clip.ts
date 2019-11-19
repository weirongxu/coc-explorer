import { fileColumnRegistrar } from '../file-column-registrar';
import { hlGroupManager } from '../../../highlight-manager';
import { enableNerdfont } from '../../../source';
import { max } from '../../../../util';

let copy = fileColumnRegistrar.getColumnConfig<string>('clip.copy');
let cut = fileColumnRegistrar.getColumnConfig<string>('clip.cut');
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
  clip: hlGroupManager.linkGroup('FileClip', 'Statement'),
};

fileColumnRegistrar.registerColumn('clip', (source) => ({
  concealable: hlGroupManager.concealable('FileClip'),
  async beforeDraw() {
    if (source.copiedNodes.size === 0 && source.cutNodes.size === 0) {
      await this.concealable?.hide();
    } else {
      await this.concealable?.show();
    }
  },
  draw(row, node) {
    const chars = source.copiedNodes.has(node) ? copy : source.cutNodes.has(node) ? cut : space;
    row.add(chars, highlights.clip);
  },
}));
