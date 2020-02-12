import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';
import { fsReadlink } from '../../../../util';
import { DrawFlexible } from '../../../view-builder';

fileColumnRegistrar.registerColumn('link', () => ({
  labelVisible: (node) => node.symbolicLink,
  async draw(row, node) {
    const flexible = fileColumnRegistrar.getColumnConfig<DrawFlexible>('link.flexible')!;
    const linkTarget = node.symbolicLink
      ? await fsReadlink(node.fullpath)
          .then((link) => {
            return '→' + link;
          })
          .catch(() => '')
      : '';
    await row.flexible(flexible, () => {
      if (linkTarget) {
        row.add(linkTarget, { hl: fileHighlights.linkTarget, unicode: true });
      }
    });
  },
}));
