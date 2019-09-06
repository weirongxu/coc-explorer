import { fileColumnManager } from '../column-manager';
import { hlGroupManager } from '../../../highlight-manager';

let copy = fileColumnManager.getColumnConfig<string>('clip.copy');
let cut = fileColumnManager.getColumnConfig<string>('clip.cut');
const width = Math.max(copy.length, cut.length) + 1;
copy = copy.padEnd(width, ' ');
cut = cut.padEnd(width, ' ');
const space = ' '.repeat(width);

const highlights = {
  clip: hlGroupManager.hlLinkGroupCommand('FileClip', 'Operator'),
};
hlGroupManager.register(highlights);

fileColumnManager.registerColumn('clip', (source) => ({
  draw(row, item) {
    if (source.copyItems.size === 0 && source.cutItems.size === 0) {
      return;
    }
    const chars = source.copyItems.has(item) ? copy : source.cutItems.has(item) ? cut : space;
    row.add(chars, highlights.clip.group);
  },
}));
