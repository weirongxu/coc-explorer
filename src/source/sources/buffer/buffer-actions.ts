import { BufferSource } from './buffer-source';
import { openStrategy, avoidOnBufEnter, execNotifyBlock } from '../../../util';

export function initBufferActions(buffer: BufferSource) {
  const { nvim } = buffer;

  buffer.addAction(
    'shrink',
    async () => {
      buffer.expanded = false;
      await buffer.reload(buffer.rootNode);
      await buffer.gotoRoot();
    },
    'shrink root node',
  );
  buffer.addRootAction(
    'expand',
    async () => {
      buffer.expanded = true;
      await buffer.reload(buffer.rootNode);
    },
    'expand root node',
  );

  buffer.addNodesAction(
    'expand',
    async (nodes) => {
      await buffer.doAction('open', nodes);
    },
    'open buffer',
  );
  buffer.addNodeAction(
    'open',
    async (node) => {
      if (openStrategy === 'vsplit') {
        await buffer.doAction('openInVsplit', node);
        await buffer.quitOnOpen();
      } else if (openStrategy === 'select') {
        await buffer.explorer.selectWindowsUI(
          async (winnr) => {
            await avoidOnBufEnter(async () => {
              await buffer.nvim.command(`${winnr}wincmd w`);
            });
            await nvim.command(`buffer ${node.bufnr}`);
            await buffer.quitOnOpen();
          },
          async () => {
            await buffer.doAction('openInVsplit', node);
            await buffer.quitOnOpen();
          },
        );
      } else if (openStrategy === 'previousBuffer') {
        const prevWinnr = await buffer.prevWinnr();
        if (prevWinnr) {
          await avoidOnBufEnter(async () => {
            await nvim.command(`${prevWinnr}wincmd w`);
          });
          await nvim.command(`buffer ${node.bufnr}`);
        } else {
          await buffer.doAction('openInVsplit', node);
        }
        await buffer.quitOnOpen();
      }
    },
    'open buffer',
    { multi: false },
  );
  buffer.addNodeAction(
    'drop',
    async (node) => {
      if (!node.hidden) {
        const info = (await nvim.call('getbufinfo', node.bufnr)) as any[];
        if (info.length && info[0].windows.length) {
          const winid = info[0].windows[0];
          await nvim.call('win_gotoid', winid);
          await buffer.quitOnOpen();
          return;
        }
      }
      await nvim.command(`buffer ${node.bufnr}`);
      await buffer.quitOnOpen();
    },
    'open buffer via drop command',
    { multi: false },
  );
  buffer.addNodeAction(
    'openInTab',
    async (node) => {
      await buffer.quitOnOpen();
      const escaped = await nvim.call('fnameescape', node.bufname);
      await nvim.command(`tabe ${escaped}`);
    },
    'open buffer via tab',
  );
  buffer.addNodeAction(
    'openInSplit',
    async (node) => {
      await nvim.command(`sbuffer ${node.bufnr}`);
      await buffer.quitOnOpen();
    },
    'open buffer via split command',
  );
  buffer.addNodeAction(
    'openInVsplit',
    async (node) => {
      await execNotifyBlock(async () => {
        nvim.command(`vertical sbuffer ${node.bufnr}`, true);
        if (buffer.explorer.args.position === 'left') {
          nvim.command('wincmd L', true);
        } else if (buffer.explorer.args.position === 'right') {
          nvim.command('wincmd H', true);
        } else if (buffer.explorer.args.position === 'tab') {
          nvim.command('wincmd L', true);
        }
        await buffer.quitOnOpen();
      });
    },
    'open buffer via vsplit command',
  );

  buffer.addNodeAction(
    'delete',
    async (node) => {
      await nvim.command(`bdelete ${node.bufnr}`);
    },
    'delete buffer',
    { reload: true },
  );
  buffer.addNodeAction(
    'deleteForever',
    async (node) => {
      await nvim.command(`bwipeout ${node.bufnr}`);
    },
    'bwipeout buffer',
    {
      reload: true,
    },
  );
}
