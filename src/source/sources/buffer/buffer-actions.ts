import { BufferSource } from './buffer-source';
import { OpenStrategy } from '../../../util';

export function initBufferActions(buffer: BufferSource) {
  const { nvim } = buffer;
  buffer.addNodeAction(
    'expand',
    async (node) => {
      if (node.expandable) {
        await buffer.expandNode(node);
      }
    },
    'expand node',
    { multi: true },
  );
  buffer.addNodeAction(
    'collapse',
    async (node) => {
      if (node.expandable && buffer.expandStore.isExpanded(node)) {
        await buffer.collapseNode(node);
      } else if (node.parent) {
        await buffer.collapseNode(node.parent!);
      }
    },
    'collapse node',
    { multi: true },
  );
  buffer.addNodeAction(
    'open',
    async (node, [arg]) => {
      await buffer.openAction(node, {
        async getURI() {
          return (await nvim.call('fnameescape', node.bufname)) as string;
        },
        openStrategy: arg as OpenStrategy,
      });
    },
    'open buffer',
    { multi: true },
  );
  buffer.addNodeAction(
    'drop',
    async (node) => {
      if (!node.hidden) {
        const info = (await nvim.call('getbufinfo', node.bufnr)) as any[];
        if (info.length && info[0].windows.length) {
          const winid = info[0].windows[0];
          await nvim.call('win_gotoid', winid);
          await buffer.explorer.tryQuitOnOpen();
          return;
        }
      }
      await nvim.command(`buffer ${node.bufnr}`);
      await buffer.explorer.tryQuitOnOpen();
    },
    'open buffer via drop command',
    { multi: true },
  );
  buffer.addNodeAction(
    'delete',
    async (node) => {
      await nvim.command(`bdelete ${node.bufnr}`);
    },
    'delete buffer',
    { multi: true, reload: true },
  );
  buffer.addNodeAction(
    'deleteForever',
    async (node) => {
      await nvim.command(`bwipeout ${node.bufnr}`);
    },
    'bwipeout buffer',
    { multi: true, reload: true },
  );
}
