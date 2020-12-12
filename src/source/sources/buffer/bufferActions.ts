import { workspace } from 'coc.nvim';
import { SourceActionRegistrar } from '../../../actions/registrar';
import { gitManager } from '../../../git/manager';
import { prompt } from '../../../util';
import { BufferNode, BufferSource } from './bufferSource';

export function loadBufferActions(
  ctx: SourceActionRegistrar<BufferSource, BufferNode>,
) {
  const { nvim } = workspace;
  const buffer = ctx.owner;

  ctx.addNodeAction(
    'expandOrCollapse',
    async ({ node }) => {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        'The action expandOrCollapse has been deprecated, use ["expanded?", "collapse", "expand"] instead of it',
        'warning',
      );
      if (node.expandable) {
        if (buffer.isExpanded(node)) {
          await ctx.doAction('collapse', node);
        } else {
          await ctx.doAction('expand', node);
        }
      }
    },
    'expand or collapse root',
    { multi: true },
  );
  ctx.addNodeAction(
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
  ctx.addNodeAction(
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
  ctx.addNodeAction(
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

  ctx.addNodesAction(
    'gitStage',
    async ({ nodes }) => {
      await gitManager.cmd.stage(nodes.map((node) => node.fullpath));
      await buffer.load(buffer.rootNode);
    },
    'add file to git index',
  );

  ctx.addNodesAction(
    'gitUnstage',
    async ({ nodes }) => {
      await gitManager.cmd.unstage(nodes.map((node) => node.fullpath));
      await buffer.load(buffer.rootNode);
    },
    'reset file from git index',
  );
}
