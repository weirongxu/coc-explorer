import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'clip', ({ source }) => ({
  draw(row, node) {
    let copy = source.getColumnConfig<string>('clip.copy');
    let cut = source.getColumnConfig<string>('clip.cut');

    if (source.config.getEnableNerdfont) {
      copy = copy ?? '';
      cut = cut ?? '';
    } else {
      copy = copy ?? 'C';
      cut = cut ?? 'X';
    }

    const ch = source.copiedNodes.has(node)
      ? copy
      : source.cutNodes.has(node)
      ? cut
      : '';
    if (ch) {
      row.add(ch, { hl: fileHighlights.clip });
    }
  },
}));
