import { workspace } from 'coc.nvim';
import { ActionSource } from '../../../actions/actionSource';
import { gitManager } from '../../../git/manager';
import { prompt } from '../../../util';
import { BufferNode, BufferSource } from './bufferSource';

export function loadBufferActions(
  action: ActionSource<BufferSource, BufferNode>,
) {
  const { nvim } = workspace;
  const buffer = action.owner;

  action.addNodeAction(
    'expandOrCollapse',
    async ({ node }) => {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        'The action expandOrCollapse has been deprecated, use ["expanded?", "collapse", "expand"] instead of it',
        'warning',
      );
      if (node.expandable) {
        if (buffer.view.isExpanded(node)) {
          await action.doAction('collapse', node);
        } else {
          await action.doAction('expand', node);
        }
      }
    },
    'expand or collapse root',
    { multi: true },
  );
  action.addNodeAction(
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
  action.addNodeAction(
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
  action.addNodeAction(
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

  action.addNodesAction(
    'gitStage',
    async ({ nodes }) => {
      await gitManager.cmd.stage(nodes.map((node) => node.fullpath));
      await buffer.load(buffer.view.rootNode);
    },
    'add file to git index',
  );

  action.addNodesAction(
    'gitUnstage',
    async ({ nodes }) => {
      await gitManager.cmd.unstage(nodes.map((node) => node.fullpath));
      await buffer.load(buffer.view.rootNode);
    },
    'reset file from git index',
  );
}
