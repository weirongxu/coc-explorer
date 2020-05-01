import { BufferSource } from './bufferSource';
import { prompt } from '../../../util';
import { OpenStrategy } from '../../../types';

export function initBufferActions(buffer: BufferSource) {
  const { nvim } = buffer;
  buffer.addNodeAction(
    'expand',
    async ({ node }) => {
      if (node.expandable) {
        await buffer.expandNode(node);
      }
    },
    'expand node',
    { multi: true },
  );
  buffer.addNodeAction(
    'collapse',
    async ({ node }) => {
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
    'expandOrCollapse',
    async ({ node }) => {
      if (node.expandable) {
        if (buffer.expandStore.isExpanded(node)) {
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
    async ({ node, args: [openStrategy, ...args] }) => {
      await buffer.openAction(node, {
        async getURI() {
          return (await nvim.call('fnameescape', node.bufname)) as string;
        },
        openStrategy: openStrategy as OpenStrategy,
        args,
      });
    },
    'open buffer',
    { multi: true },
  );
  buffer.addNodeAction(
    'drop',
    async ({ node }) => {
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
    async ({ node }) => {
      if (
        buffer.bufManager.modified(node.fullpath) &&
        (await prompt('Buffer is being modified, delete it?')) !== 'yes'
      ) {
        return;
      }
      await nvim.command(`bdelete! ${node.bufnr}`);
      await buffer.reload(node, { force: true });
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
      await buffer.reload(node, { force: true });
    },
    'bwipeout buffer',
    { multi: true },
  );
}
