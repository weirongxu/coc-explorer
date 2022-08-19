import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'clip', ({ source }) => ({
  async draw() {
    let copy = source.getColumnConfig<string>('clip.copy');
    let cut = source.getColumnConfig<string>('clip.cut');

    if (source.config.get('icon.enableNerdfont')) {
      copy = copy ?? '';
      cut = cut ?? '';
    } else {
      copy = copy ?? 'C';
      cut = cut ?? 'X';
    }

    const clipboardStorage = source.explorer.explorerManager.clipboardStorage;
    const content = await clipboardStorage.getFiles();
    const fullpathSet = new Set(content.fullpaths);

    return {
      drawNode(row, { node }) {
        if (content.type === 'none') {
          return;
        }
        const ch = fullpathSet.has(node.fullpath)
          ? content.type === 'cut'
            ? cut
            : copy
          : '';
        if (ch) {
          row.add(ch, { hl: fileHighlights.clip });
        }
      },
    };
  },
}));
