import { BookmarkSource } from './bookmarkSource';

export function initBookmarkActions(bookmark: BookmarkSource) {
  bookmark.addNodeAction(
    'open',
    async ({ node, args }) => {
      await bookmark.openAction(node, () => node.fullpath, {
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
