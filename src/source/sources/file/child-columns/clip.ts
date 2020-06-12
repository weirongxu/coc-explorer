import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'clip', ({ source }) => ({
  draw() {
    let copy = source.getColumnConfig<string>('clip.copy');
    let cut = source.getColumnConfig<string>('clip.cut');

    if (source.config.get('icon.enableNerdfont')) {
      copy = copy ?? '';
      cut = cut ?? '';
    } else {
      copy = copy ?? 'C';
      cut = cut ?? 'X';
    }

    return {
      drawNode(row, { node }) {
        const ch = source.copiedNodes.has(node)
          ? copy
          : source.cutNodes.has(node)
          ? cut
          : '';
        if (ch) {
          row.add(ch, { hl: fileHighlights.clip });
        }
      },
    };
  },
}));
