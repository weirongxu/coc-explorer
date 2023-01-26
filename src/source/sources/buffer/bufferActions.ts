import { workspace } from 'coc.nvim';
import type { ActionSource } from '../../../actions/actionSource';
import { bufferTabOnly } from '../../../config';
import { tabContainerManager } from '../../../container';
import {
  leaveEmptyInWinids,
  prompt,
  winidsByBufnrInCurTab,
} from '../../../util';
import type { BufferNode, BufferSource } from './bufferSource';

export function loadBufferActions(
  action: ActionSource<BufferSource, BufferNode>,
) {
  const { nvim } = workspace;
  const buffer = action.owner;

  action.addNodeAction(
    'drop',
    async ({ node }) => {
      if (!node.hidden) {
        const info = (await nvim.call('getbufinfo', node.bufnr)) as any[];
        if (info.length && info[0].windows.length) {
          const quitNotifier = await buffer.explorer.tryQuitOnOpenNotifier();
          const winid = info[0].windows[0];
          nvim.pauseNotification();
          nvim.call('win_gotoid', winid, true);
          quitNotifier.notify();
          await nvim.resumeNotification();
          return;
        }
      }
      const quitNotifier = await buffer.explorer.tryQuitOnOpenNotifier();
      nvim.pauseNotification();
      nvim.command(`buffer ${node.bufnr}`, true);
      quitNotifier.notify();
      await nvim.resumeNotification();
    },
    'open buffer by drop command',
    { select: true },
  );
  action.addNodeAction(
    'delete',
    async ({ node }) => {
      if (bufferTabOnly()) {
        // remove buffer in tab container
        await tabContainerManager.curTabDelBufnr(node.bufnr);
        if (tabContainerManager.existBufnr(node.bufnr)) {
          const winids = await winidsByBufnrInCurTab(node.bufnr);
          await leaveEmptyInWinids(winids);
          return;
        }
      }

      if (
        buffer.bufManager.modified(node.fullpath, {
          directory: false,
        }) &&
        (await prompt('Buffer is being modified, delete it?')) !== 'yes'
      ) {
        return;
      }
      await buffer.bufManager.removeBufNode(node, {
        skipModified: true,
        bwipeout: false,
        directory: false,
      });
      await buffer.load(node, { force: true });
    },
    'delete buffer',
    { select: true },
  );
  action.addNodeAction(
    'deleteForever',
    async ({ node }) => {
      if (
        buffer.bufManager.modified(node.fullpath, {
          directory: false,
        }) &&
        (await prompt('Buffer is being modified, wipeout it?')) !== 'yes'
      ) {
        return;
      }
      await buffer.bufManager.removeBufNode(node, {
        skipModified: true,
        bwipeout: true,
        directory: false,
      });
      await buffer.load(node, { force: true });
    },
    'bwipeout buffer',
    { select: true },
  );
}
