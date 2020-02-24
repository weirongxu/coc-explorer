import { fileColumnRegistrar } from '../file-column-registrar';
import { getEnableNerdfont } from '../../../../util';
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

fileColumnRegistrar.registerColumn('child', 'clip', ({ source }) => ({
  draw(row, node) {
    const ch = source.copiedNodes.has(node) ? copy : source.cutNodes.has(node) ? cut : '';
    if (ch) {
      row.add(ch, { hl: fileHighlights.clip });
    }
  },
}));
