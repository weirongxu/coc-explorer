import { BookmarkSource } from './bookmarkSource';
import { OpenStrategy } from '../../../types';

export function initBookmarkActions(bookmark: BookmarkSource) {
  bookmark.addNodeAction(
    'expand',
    async ({ node }) => {
      if (node.expandable) {
        await bookmark.expandNode(node);
      }
    },
    'expand node',
    { multi: true },
  );
  bookmark.addNodeAction(
    'collapse',
    async ({ node }) => {
      if (node.expandable && bookmark.isExpanded(node)) {
        await bookmark.collapseNode(node);
      } else if (node.parent) {
        await bookmark.collapseNode(node.parent);
      }
    },
    'collapse node',
    { multi: true },
  );
  bookmark.addNodeAction(
    'open',
    async ({ node, args: [openStrategy, ...args] }) => {
      await bookmark.openAction(node, () => node.fullpath, {
        openStrategy: openStrategy as OpenStrategy,
        args,
        position: { lineIndex: node.lnum - 1 },
      });
    },
    'jump to bookmark position',
    {
      multi: true,
      args: bookmark.openActionArgs,
      menus: bookmark.openActionMenu,
    },
  );
}
