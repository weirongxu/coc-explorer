import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';
import { fsReadlink } from '../../../../util';

fileColumnRegistrar.registerColumn('child', 'link', () => ({
  labelVisible: (node) => node.symbolicLink,
  async draw(row, node) {
    const linkTarget = node.symbolicLink
      ? await fsReadlink(node.fullpath)
          .then((link) => {
            return '→' + link;
          })
          .catch(() => '')
      : '';
    if (linkTarget) {
      row.add(linkTarget, { hl: fileHighlights.linkTarget, unicode: true });
    }
  },
}));
