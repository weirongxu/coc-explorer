import { workspace } from 'coc.nvim';
import { prompt } from '../../../util';
import { BufferSource } from './bufferSource';

export function initBufferActions(buffer: BufferSource) {
  const { nvim } = buffer;
  buffer.addNodeAction(
    'expandOrCollapse',
    async ({ node }) => {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        'The action expandOrCollapse has been deprecated, use ["expanded?", "collapse", "expand"] instead of it',
        'warning',
      );
      if (node.expandable) {
        if (buffer.isExpanded(node)) {
          await buffer.doAction('collapse', node);
        } else {
          await buffer.doAction('expand', node);
        }
      }
    },
    'expand or collapse root',
    { multi: true },
  );
  buffer.addNodeAction(
    'open',
    async ({ node, args }) => {
      await buffer.openAction(node, () => node.fullpath, {
        args,
      });
    },
    'open buffer',
    {
      multi: true,
      args: buffer.openActionArgs,
      menus: buffer.openActionMenu,
    },
  );
  buffer.addNodeAction(
    'drop',
    async ({ node }) => {
      if (!node.hidden) {
        const info = (await nvim.call('getbufinfo', node.bufnr)) as any[];
        if (info.length && info[0].windows.length) {
          const winid = info[0].windows[0];
          nvim.pauseNotification();
          nvim.call('win_gotoid', winid, true);
          (await buffer.explorer.tryQuitOnOpenNotifier()).notify();
          await nvim.resumeNotification();
          return;
        }
      }
      nvim.pauseNotification();
      nvim.command(`buffer ${node.bufnr}`, true);
      (await buffer.explorer.tryQuitOnOpenNotifier()).notify();
      await nvim.resumeNotification();
    },
    'open buffer by drop command',
    { multi: true },
  );
  buffer.addNodeAction(
    'delete',
    async ({ node }) => {
      if (
        buffer.bufManager.modified(node.fullpath) &&
        (await prompt('Buffer is being modified, delete it?')) !== 'yes'
      ) {
        return;
      }
      await nvim.command(`bdelete! ${node.bufnr}`);
      await buffer.load(node, { force: true });
    },
    'delete buffer',
    { multi: true },
  );
  buffer.addNodeAction(
    'deleteForever',
    async ({ node }) => {
      if (
        buffer.bufManager.modified(node.fullpath) &&
        (await prompt('Buffer is being modified, wipeout it?')) !== 'yes'
      ) {
        return;
      }
      await nvim.command(`bwipeout! ${node.bufnr}`);
      await buffer.load(node, { force: true });
    },
    'bwipeout buffer',
    { multi: true },
  );
}
