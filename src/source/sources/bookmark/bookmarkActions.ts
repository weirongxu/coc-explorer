import { BookmarkSource } from './bookmarkSource';
import { OpenStrategy } from '../../../types';

export function initBookmarkActions(bookmark: BookmarkSource) {
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
