import { Notifier } from 'coc-helper';
import { listManager, workspace } from 'coc.nvim';
import open from 'open';
import pathLib from 'path';
import { ActionSource } from '../../../actions/actionSource';
import { driveList } from '../../../lists/drives';
import { explorerWorkspaceFolderList } from '../../../lists/workspaceFolders';
import {
  CopyOrCutFileType,
  copyOrCutFileTypeList,
  RevealStrategy,
  revealStrategyList,
} from '../../../types';
import {
  bufnrByWinnrOrWinid,
  fsCopyFileRecursive,
  fsMkdirp,
  fsRename,
  fsRimraf,
  fsTouch,
  fsTrash,
  input,
  isWindows,
  listDrive,
  overwritePrompt,
  prompt,
} from '../../../util';
import { FileNode, FileSource } from './fileSource';

export function loadFileActions(action: ActionSource<FileSource, FileNode>) {
  const { nvim } = workspace;
  const file = action.owner;

  action.addNodeAction(
    'gotoParent',
    async () => {
      if (file.root === '') {
        return;
      }
      const nodeUid = file.view.currentNode()?.uid;
      if (/^[A-Za-z]:[\\\/]$/.test(file.root)) {
        file.root = '';
      } else {
        file.root = pathLib.dirname(file.root);
        await file.cd(file.root);
      }
      await file.view.expand(file.view.rootNode);
      if (nodeUid) {
        await file.locator.gotoNodeUid(nodeUid);
      }
    },
    'change directory to parent directory',
  );
  action.addNodeAction(
    'reveal',
    async ({ args }) => {
      const target = args[0];
      let targetBufnr: number | undefined;
      let targetPath: string | undefined;
      if (/\d+/.test(target)) {
        targetBufnr = parseInt(target, 10);
        if (targetBufnr === 0) {
          targetBufnr = workspace.bufnr;
        }
      } else {
        const revealStrategy = (target ?? 'previousWindow') as RevealStrategy;

        const actions: Record<
          RevealStrategy,
          undefined | ((args?: string[]) => void | Promise<void>)
        > = {
          select: async () => {
            await file.explorer.selectWindowsUI(async (winnr) => {
              targetBufnr = await bufnrByWinnrOrWinid(winnr);
            });
          },
          sourceWindow: async () => {
            targetBufnr = await bufnrByWinnrOrWinid(
              await file.explorer.sourceWinnr(),
            );
          },
          previousBuffer: async () => {
            targetBufnr = await file.explorer.explorerManager.previousBufnr.get();
          },
          previousWindow: async () => {
            targetBufnr = await bufnrByWinnrOrWinid(
              await file.explorer.explorerManager.prevWinnrByPrevWindowID(),
            );
          },
          path: async () => {
            targetPath = args[1];
            if (!targetPath) {
              targetPath = await input(
                'Input a reveal path:',
                file.view.currentNode()?.fullpath ?? '',
                'file',
              );
            }
          },
        };
        await actions[revealStrategy]?.();
      }

      if (targetBufnr) {
        const bufinfo = await nvim.call('getbufinfo', [targetBufnr]);
        if (!bufinfo[0] || !bufinfo[0].name) {
          return;
        }

        targetPath = bufinfo[0].name;
      }

      if (!targetPath) {
        return;
      }

      const expandOptions = args[1] ?? '';
      const compact = expandOptions.includes('compact') || undefined;
      const [revealNode, notifiers] = await file.revealNodeByPathNotifier(
        targetPath,
        {
          compact,
        },
      );
      if (revealNode) {
        await Notifier.runAll(notifiers);
      }
    },
    'reveal buffer in explorer',
    {
      args: [
        {
          name: 'target',
          description: `bufnr number | ${revealStrategyList.join(' | ')}`,
        },
      ],
      menus: {
        '0': 'use current buffer',
        '0:compact': 'use current buffer and compact',
        select: 'use select windows UI',
        previousBuffer: 'use last used buffer',
        previousWindow: 'use last used window',
        sourceWindow: 'use the window where explorer opened',
        path: {
          description: 'use custom path',
          args: 'path:<path>',
          async actionArgs() {
            return ['path'];
          },
        },
      },
    },
  );
  action.addNodeAction(
    'cd',
    async ({ node, args }) => {
      const cdTo = async (fullpath: string) => {
        await file.cd(fullpath);
        file.root = fullpath;
        await file.view.expand(file.view.rootNode);
      };
      const path = args[0];
      if (path !== undefined) {
        await cdTo(path);
      } else {
        if (node.directory) {
          await cdTo(node.fullpath);
        }
      }
    },
    'change directory to current node',
    {
      args: [
        {
          name: 'path',
        },
      ],
      menus: {
        path: {
          description: '',
          args: '<path>',
          async actionArgs() {
            return [
              await input(
                'input a cd path:',
                file.view.currentNode()?.fullpath ?? '',
                'file',
              ),
            ];
          },
        },
      },
    },
  );
  action.addNodeAction(
    'workspaceFolders',
    async () => {
      explorerWorkspaceFolderList.setFileSource(file);
      const disposable = listManager.registerList(explorerWorkspaceFolderList);
      await listManager.start(['--normal', explorerWorkspaceFolderList.name]);
      disposable.dispose();
    },
    'change directory to current node',
  );
  action.addNodeAction(
    'drop',
    async ({ node }) => {
      if (!node.directory) {
        nvim.pauseNotification();
        await nvim.command(`drop ${node.fullpath}`);
        (await file.explorer.tryQuitOnOpenNotifier()).notify();
        await nvim.resumeNotification();
      }
    },
    'open file by drop command',
    { select: true },
  );

  action.addNodesAction(
    'copyFilepath',
    async ({ nodes }) => {
      await file.copyToClipboard(
        nodes ? nodes.map((it) => it.fullpath).join('\n') : file.root,
      );
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage('Copy filepath to clipboard');
    },
    'copy full filepath to clipboard',
  );
  action.addNodesAction(
    'copyFilename',
    async ({ nodes }) => {
      await file.copyToClipboard(
        nodes
          ? nodes.map((it) => it.name).join('\n')
          : pathLib.basename(file.root),
      );
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage('Copy filename to clipboard');
    },
    'copy filename to clipboard',
  );

  const copyOrCutFileOptions = {
    args: [
      {
        name: 'type',
        description: copyOrCutFileTypeList.join(' | '),
      },
    ],
    menus: {
      append: 'append',
      replace: 'replace',
    },
  };
  action.addNodesAction(
    'copyFile',
    async ({ nodes, args }) => {
      const type = (args[0] ?? 'append') as CopyOrCutFileType;
      if (type === 'replace') {
        file.view.requestRenderNodes([...file.copiedNodes, ...file.cutNodes]);
        file.copiedNodes.clear();
        file.cutNodes.clear();
      }
      nodes.forEach((node) => {
        file.copiedNodes.add(node);
      });
      file.view.requestRenderNodes(nodes);
    },
    'copy file for paste',
    copyOrCutFileOptions,
  );
  action.addNodesAction(
    'cutFile',
    async ({ nodes, args }) => {
      const type = (args[0] ?? 'append') as CopyOrCutFileType;
      if (type === 'replace') {
        file.view.requestRenderNodes([...file.copiedNodes, ...file.cutNodes]);
        file.copiedNodes.clear();
        file.cutNodes.clear();
      }
      nodes.forEach((node) => {
        file.cutNodes.add(node);
      });
      file.view.requestRenderNodes(nodes);
    },
    'cut file for paste',
    copyOrCutFileOptions,
  );
  action.addNodeAction(
    'pasteFile',
    async ({ node }) => {
      if (file.copiedNodes.size <= 0 && file.cutNodes.size <= 0) {
        // eslint-disable-next-line no-restricted-properties
        workspace.showMessage('Copied files or cut files is empty', 'error');
        return;
      }
      const targetDir = file.getPutTargetDir(node);
      let loadRoot = false;
      if (file.copiedNodes.size > 0) {
        const nodes = [...file.copiedNodes];
        await overwritePrompt(
          'paste',
          nodes.map((node) => ({
            source: node.fullpath,
            target: pathLib.join(targetDir, pathLib.basename(node.fullpath)),
          })),
          fsCopyFileRecursive,
        );
        file.view.requestRenderNodes(nodes);
        file.copiedNodes.clear();
      }
      if (file.cutNodes.size > 0) {
        loadRoot = true;
        const nodes = [...file.cutNodes];
        await overwritePrompt(
          'paste',
          nodes.map((node) => ({
            source: node.fullpath,
            target: pathLib.join(targetDir, pathLib.basename(node.fullpath)),
          })),
          fsRename,
        );
        file.cutNodes.clear();
      }
      await file.load(
        loadRoot ? file.view.rootNode : node.parent ? node.parent : node,
      );
    },
    'paste files to here',
  );
  action.addNodesAction(
    'delete',
    async ({ nodes }) => {
      if (
        nodes.some((node) => file.bufManager.modified(node.fullpath)) &&
        (await prompt('Buffer is being modified, discard it?')) !== 'yes'
      ) {
        return;
      }

      const list = nodes.map((node) => node.fullpath).join('\n');
      if (
        (await prompt('Move these files or directories to trash?\n' + list)) !==
        'yes'
      ) {
        return;
      }

      await fsTrash(nodes.map((node) => node.fullpath));

      for (const node of nodes) {
        await file.bufManager.remove(node.fullpath, true);
      }
    },
    'move file or directory to trash',
    { reload: true },
  );
  action.addNodesAction(
    'deleteForever',
    async ({ nodes }) => {
      if (
        nodes.some((node) => file.bufManager.modified(node.fullpath)) &&
        (await prompt('Buffer is being modified, discard it?')) !== 'yes'
      ) {
        return;
      }

      const list = nodes.map((node) => node.fullpath).join('\n');
      if (
        (await prompt(
          'Forever delete these files or directories?\n' + list,
        )) !== 'yes'
      ) {
        return;
      }

      for (const node of nodes) {
        await fsRimraf(node.fullpath);
        await file.bufManager.remove(node.fullpath, true);
      }
    },
    'delete file or directory forever',
    { reload: true },
  );

  action.addNodeAction(
    'addFile',
    async ({ node, args }) => {
      let filename: string | undefined;

      const promptText = 'Input a new filename:';
      if (args[0]) {
        filename = args[0];
      } else {
        filename = await input(promptText, '', 'file');
      }

      filename = filename?.trim();
      if (!filename) {
        return;
      }

      if (['/', '\\'].includes(filename[filename.length - 1])) {
        await action.doAction('addDirectory', node, [filename]);
        return;
      }
      const putTargetNode = file.getPutTargetNode(node);
      const targetPath = pathLib.join(putTargetNode.fullpath, filename);
      await overwritePrompt(
        'add file',
        [
          {
            source: undefined,
            target: targetPath,
          },
        ],
        async (_source, target) => {
          await fsTouch(target);
        },
      );
      await file.load(putTargetNode);
      const [, notifiers] = await file.revealNodeByPathNotifier(targetPath, {
        node: putTargetNode,
      });
      await Notifier.runAll(notifiers);
    },
    'add a new file',
  );
  action.addNodeAction(
    'addDirectory',
    async ({ node, args }) => {
      let directoryName =
        args[0] ?? (await input('Input a new directory name:', '', 'file'));
      directoryName = directoryName.trim().replace(/(\/|\\)*$/g, '');
      if (!directoryName) {
        return;
      }
      const putTargetNode = file.getPutTargetNode(node);
      const targetPath = pathLib.join(putTargetNode.fullpath, directoryName);
      await overwritePrompt(
        'add directory',
        [
          {
            source: undefined,
            target: targetPath,
          },
        ],
        async (_source, target) => {
          await fsMkdirp(target);
        },
      );
      const reloadNotifier = await file.loadNotifier(putTargetNode);
      const [, revealNotifiers] = await file.revealNodeByPathNotifier(
        targetPath,
        {
          node: putTargetNode,
        },
      );
      await Notifier.runAll([reloadNotifier, ...revealNotifiers]);
    },
    'add a new directory',
  );
  action.addNodeAction(
    'rename',
    async ({ node }) => {
      if (
        file.bufManager.modified(node.fullpath) &&
        (await prompt('Buffer is being modified, discard it?')) !== 'yes'
      ) {
        return;
      }

      let targetPath: string | undefined;

      targetPath = await input(
        `Rename: ${node.fullpath} ->`,
        node.fullpath,
        'file',
      );

      targetPath = targetPath?.trim();
      if (!targetPath) {
        return;
      }

      await overwritePrompt(
        'rename',
        [
          {
            source: node.fullpath,
            target: targetPath,
          },
        ],
        fsRename,
      );

      await file.bufManager.remove(node.fullpath, true);

      await file.load(file.view.rootNode);
    },

    'rename a file or directory',
  );

  action.addNodesAction(
    'systemExecute',
    async ({ nodes }) => {
      if (nodes) {
        await Promise.all(nodes.map((node) => open(node.fullpath)));
      } else {
        await open(file.root);
      }
    },
    'use system application open file or directory',
  );

  if (isWindows) {
    action.addNodeAction(
      'listDrive',
      async () => {
        const drives = await listDrive();
        driveList.setExplorerDrives(
          drives.map((drive) => ({
            name: drive,
            callback: async (drive) => {
              file.root = drive;
              await file.view.expand(file.view.rootNode);
            },
          })),
        );
        const disposable = listManager.registerList(driveList);
        await listManager.start([
          '--normal',
          '--number-select',
          driveList.name,
        ]);
        disposable.dispose();
      },
      'list drives',
    );
  }

  action.addNodeAction(
    'search',
    async ({ node }) => {
      await file.searchByCocList(
        node.isRoot ? node.fullpath : pathLib.dirname(node.fullpath),
        false,
      );
    },
    'search by coc-list',
  );

  action.addNodeAction(
    'searchRecursive',
    async ({ node }) => {
      await file.searchByCocList(pathLib.dirname(node.fullpath), true);
    },
    'search by coc-list recursively',
  );

  action.addNodeAction(
    'toggleOnlyGitChange',
    async () => {
      file.showOnlyGitChange = !file.showOnlyGitChange;
      const loadNotifier = await file.loadNotifier(file.view.rootNode, {
        force: true,
      });

      nvim.pauseNotification();
      file.highlight.clearHighlightsNotify();
      loadNotifier?.notify();
      await nvim.resumeNotification();
    },
    'toggle visibility of git change node',
    { reload: true },
  );
}
