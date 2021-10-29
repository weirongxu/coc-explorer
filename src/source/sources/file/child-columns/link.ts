import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { fsReadlink } from '../../../../util';

fileColumnRegistrar.registerColumn('child', 'link', () => ({
  draw() {
    return {
      labelVisible: ({ node }) => node.symbolicLink,
      async drawNode(row, { node }) {
        const linkTarget = node.symbolicLink
          ? await fsReadlink(node.fullpath)
              .then((link) => link)
              .catch(() => '')
          : '';
        if (linkTarget) {
          row.add(linkTarget, { hl: fileHighlights.linkTarget, unicode: true });
        }
      },
    };
  },
}));
