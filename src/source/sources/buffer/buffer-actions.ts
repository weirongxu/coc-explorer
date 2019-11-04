import { BufferSource } from './buffer-source';
import { openStrategy, avoidOnBufEnter, execNotifyBlock } from '../../../util';

export function initBufferActions(buffer: BufferSource) {
  const { nvim } = buffer;

  buffer.addAction(
    'toggleHidden',
    async () => {
      buffer.showHiddenBuffers = !buffer.showHiddenBuffers;
    },
    'toggle visibility of unlisted buffers',
    { reload: true },
  );
  buffer.addAction(
    'shrink',
    async () => {
      buffer.expanded = false;
      await buffer.reload(null);
      await buffer.gotoRoot();
    },
    'shrink root node',
  );
  buffer.addRootAction(
    'expand',
    async () => {
      buffer.expanded = true;
      await buffer.reload(null);
    },
    'expand root node',
  );

  buffer.addItemsAction(
    'expand',
    async (items) => {
      await buffer.doAction('open', items);
    },
    'open buffer',
  );
  buffer.addItemAction(
    'open',
    async (item) => {
      if (openStrategy === 'vsplit') {
        await buffer.doAction('openInVsplit', item);
        await buffer.quitOnOpen();
      } else if (openStrategy === 'select') {
        await buffer.explorer.selectWindowsUI(
          async (winnr) => {
            await avoidOnBufEnter(async () => {
              await buffer.nvim.command(`${winnr}wincmd w`);
            });
            await nvim.command(`buffer ${item.bufnr}`);
            await buffer.quitOnOpen();
          },
          async () => {
            await buffer.doAction('openInVsplit', item);
            await buffer.quitOnOpen();
          },
        );
      } else if (openStrategy === 'previousBuffer') {
        const prevWinnr = await buffer.prevWinnr();
        if (prevWinnr) {
          await avoidOnBufEnter(async () => {
            await nvim.command(`${prevWinnr}wincmd w`);
          });
          await nvim.command(`buffer ${item.bufnr}`);
        } else {
          await buffer.doAction('openInVsplit', item);
        }
        await buffer.quitOnOpen();
      }
    },
    'open buffer',
    { multi: false },
  );
  buffer.addItemAction(
    'drop',
    async (item) => {
      if (!item.hidden) {
        const info = (await nvim.call('getbufinfo', item.bufnr)) as any[];
        if (info.length && info[0].windows.length) {
          const winid = info[0].windows[0];
          await nvim.call('win_gotoid', winid);
          await buffer.quitOnOpen();
          return;
        }
      }
      await nvim.command(`buffer ${item.bufnr}`);
      await buffer.quitOnOpen();
    },
    'open buffer via drop command',
    { multi: false },
  );
  buffer.addItemAction(
    'openInTab',
    async (item) => {
      await buffer.quitOnOpen();
      const escaped = await nvim.call('fnameescape', item.bufname);
      await nvim.command(`tabe ${escaped}`);
    },
    'open buffer via tab',
  );
  buffer.addItemAction(
    'openInSplit',
    async (item) => {
      await nvim.command(`sbuffer ${item.bufnr}`);
      await buffer.quitOnOpen();
    },
    'open buffer via split command',
  );
  buffer.addItemAction(
    'openInVsplit',
    async (item) => {
      await execNotifyBlock(async () => {
        nvim.command(`vertical sbuffer ${item.bufnr}`, true);
        if (buffer.explorer.args.position === 'left') {
          nvim.command('wincmd L', true);
        } else if (buffer.explorer.args.position === 'right') {
          nvim.command('wincmd H', true);
        }
        await buffer.quitOnOpen();
      });
    },
    'open buffer via vsplit command',
  );

  buffer.addItemAction(
    'delete',
    async (item) => {
      await nvim.command(`bdelete ${item.bufnr}`);
    },
    'delete buffer',
    { reload: true },
  );
  buffer.addItemAction(
    'deleteForever',
    async (item) => {
      await nvim.command(`bwipeout ${item.bufnr}`);
    },
    'bwipeout buffer',
    {
      reload: true,
    },
  );
}
