import { FileSource } from './file-source';
import pathLib from 'path';
import {
  fsCopyFileRecursive,
  fsRename,
  fsTrash,
  fsRimraf,
  fsMkdirp,
  fsTouch,
  isWindows,
  listDrive,
  config,
  prompt,
  overwritePrompt,
  OpenStrategy,
  Notifier,
} from '../../../util';
import { workspace, listManager } from 'coc.nvim';
import open from 'open';
import { driveList } from '../../../lists/drives';
import { gitManager } from '../../../git-manager';

export function initFileActions(file: FileSource) {
  const { nvim } = file;

  file.addNodeAction(
    'gotoParent',
    async () => {
      file.root = pathLib.dirname(file.root);
      await file.cd(file.root);
      file.expandStore.expand(file.rootNode);
      await file.reload(file.rootNode);
    },
    'change directory to parent directory',
  );
  file.addNodeAction(
    'cd',
    async (node) => {
      if (node.directory) {
        await file.cd(node.fullpath);
        file.root = node.fullpath;
        file.expanded = true;
        await file.reload(file.rootNode);
      }
    },
    'change directory to current node',
  );
  file.addNodeAction(
    'open',
    async (node, [arg]) => {
      if (node.directory) {
        if (config.get<boolean>('openAction.changeDirectory')!) {
          await file.doAction('cd', node);
        } else {
          await file.doAction('expandOrCollapse', node);
        }
      } else {
        await file.openAction(node, {
          openStrategy: arg as OpenStrategy,
        });
      }
    },
    'open file or directory',
    { multi: true },
  );
  file.addNodeAction(
    'drop',
    async (node) => {
      if (!node.directory) {
        await nvim.command(`drop ${node.fullpath}`);
        await file.explorer.tryQuitOnOpen();
      }
    },
    'open file via drop command',
    { multi: true },
  );
  file.addNodeAction(
    'expand',
    async (node) => {
      if (node.directory) {
        await file.expandNode(node);
      }
    },
    'expand directory or open file',
    { multi: true },
  );
  file.addNodeAction(
    'expandRecursive',
    async (node) => {
      if (node.directory) {
        await file.expandNode(node, { recursive: true });
      }
    },
    'expand directory recursively',
    { multi: true },
  );
  file.addNodeAction(
    'collapse',
    async (node) => {
      if (node.directory && file.expandStore.isExpanded(node)) {
        await file.collapseNode(node);
      } else if (node.parent) {
        await file.collapseNode(node.parent!);
      }
    },
    'collapse directory',
    { multi: true },
  );
  file.addNodeAction(
    'collapseRecursive',
    async (node) => {
      if (node.directory && file.expandStore.isExpanded(node)) {
        await file.collapseNode(node, { recursive: true });
      } else if (node.parent) {
        await file.collapseNode(node.parent!, { recursive: true });
      }
    },
    'collapse directory recursively',
    { multi: true },
  );
  file.addNodeAction(
    'expandOrCollapse',
    async (node) => {
      if (node.directory) {
        if (file.expandStore.isExpanded(node)) {
          await file.doAction('collapse', node);
        } else {
          await file.doAction('expand', node);
        }
      }
    },
    'expand or collapse directory',
    { multi: true },
  );

  file.addNodesAction(
    'copyFilepath',
    async (nodes) => {
      await file.copy(nodes ? nodes.map((it) => it.fullpath).join('\n') : file.root);
      // tslint:disable-next-line: ban
      workspace.showMessage('Copy filepath to clipboard');
    },
    'copy full filepath to clipboard',
  );
  file.addNodesAction(
    'copyFilename',
    async (nodes) => {
      await file.copy(nodes ? nodes.map((it) => it.name).join('\n') : pathLib.basename(file.root));
      // tslint:disable-next-line: ban
      workspace.showMessage('Copy filename to clipboard');
    },
    'copy filename to clipboard',
  );
  file.addNodesAction(
    'copyFile',
    async (nodes) => {
      const clearNodes = [...file.copiedNodes, ...file.cutNodes];
      file.copiedNodes.clear();
      file.cutNodes.clear();
      nodes.forEach((node) => {
        file.copiedNodes.add(node);
      });
      file.requestRenderNodes(clearNodes.concat(nodes));
    },
    'copy file for paste',
  );
  file.addNodesAction(
    'cutFile',
    async (nodes) => {
      const clearNodes = [...file.copiedNodes, ...file.cutNodes];
      file.copiedNodes.clear();
      file.cutNodes.clear();
      nodes.forEach((node) => {
        file.cutNodes.add(node);
      });
      file.requestRenderNodes(clearNodes.concat(nodes));
    },
    'cut file for paste',
  );
  file.addNodeAction(
    'pasteFile',
    async (node) => {
      const targetDir = file.getPutTargetDir(node);
      if (file.copiedNodes.size > 0) {
        const nodes = Array.from(file.copiedNodes);
        await overwritePrompt(
          nodes.map((node) => ({
            source: node.fullpath,
            target: pathLib.join(targetDir, pathLib.basename(node.fullpath)),
          })),
          fsCopyFileRecursive,
        );
        file.requestRenderNodes(nodes);
        file.copiedNodes.clear();
        await file.reload(node.parent ? node.parent : node);
      } else if (file.cutNodes.size > 0) {
        const nodes = Array.from(file.cutNodes);
        await overwritePrompt(
          nodes.map((node) => ({
            source: node.fullpath,
            target: pathLib.join(targetDir, pathLib.basename(node.fullpath)),
          })),
          fsRename,
        );
        file.cutNodes.clear();
        await file.reload(file.rootNode);
      } else {
        // tslint:disable-next-line: ban
        workspace.showMessage('Copied files or cut files is empty', 'error');
      }
    },
    'paste files to here',
  );
  file.addNodesAction(
    'delete',
    async (nodes) => {
      const list = nodes.map((node) => node.fullpath).join('\n');
      if ((await prompt('Move these files or directories to trash?\n' + list)) === 'yes') {
        await fsTrash(nodes.map((node) => node.fullpath));
      }
    },
    'move file or directory to trash',
    { reload: true },
  );
  file.addNodesAction(
    'deleteForever',
    async (nodes) => {
      const list = nodes.map((node) => node.fullpath).join('\n');
      if ((await prompt('Forever delete these files or directories?\n' + list)) === 'yes') {
        for (const node of nodes) {
          await fsRimraf(node.fullpath);
        }
      }
    },
    'delete file or directory forever',
    { reload: true },
  );

  file.addNodeAction(
    'addFile',
    async (node, [arg]) => {
      let filename =
        arg ?? ((await nvim.call('input', ['Input a new filename: ', '', 'file'])) as string);
      filename = filename.trim();
      if (!filename) {
        return;
      }
      if (filename.endsWith('/') || filename.endsWith('\\')) {
        await file.doAction('addDirectory', node, [filename]);
        return;
      }
      const putTargetNode = file.getPutTargetNode(node);
      const targetPath = pathLib.join(putTargetNode.fullpath, filename);
      await overwritePrompt(
        [
          {
            source: null,
            target: targetPath,
          },
        ],
        async (_source, target) => {
          await fsTouch(target);
        },
      );
      await file.reload(putTargetNode);
      const [, notifiers] = await file.revealNodeByPathNotifier(targetPath, {
        node: putTargetNode,
        render: true,
        goto: true,
      });
      await Notifier.runAll(notifiers);
    },
    'add a new file',
  );
  file.addNodeAction(
    'addDirectory',
    async (node, [arg]) => {
      let directoryName =
        arg ?? ((await nvim.call('input', ['Input a new directory name: ', '', 'file'])) as string);
      directoryName = directoryName.trim().replace(/(\/|\\)*$/g, '');
      if (!directoryName) {
        return;
      }
      const putTargetNode = file.getPutTargetNode(node);
      const targetPath = pathLib.join(putTargetNode.fullpath, directoryName);
      await overwritePrompt(
        [
          {
            source: null,
            target: targetPath,
          },
        ],
        async (_source, target) => {
          await fsMkdirp(target);
        },
      );
      const reloadNotifier = await file.reloadNotifier(putTargetNode);
      const [, revealNotifiers] = await file.revealNodeByPathNotifier(targetPath, {
        node: putTargetNode,
        render: true,
        goto: true,
      });
      await Notifier.runAll([reloadNotifier, ...revealNotifiers]);
    },
    'add a new directory',
  );
  file.addNodeAction(
    'rename',
    async (node) => {
      const targetPath = (await nvim.call('input', [
        `Rename: ${node.fullpath} ->`,
        node.fullpath,
        'file',
      ])) as string;
      if (targetPath.length == 0) {
        return;
      }
      await overwritePrompt(
        [
          {
            source: node.fullpath,
            target: targetPath,
          },
        ],
        fsRename,
      );
      await file.reload(file.rootNode);
    },
    'rename a file or directory',
  );

  file.addNodesAction(
    'systemExecute',
    async (nodes) => {
      if (nodes) {
        await Promise.all(nodes.map((node) => open(node.fullpath)));
      } else {
        await open(file.root);
      }
    },
    'use system application open file or directory',
  );

  if (isWindows) {
    file.addNodeAction(
      'listDrive',
      async () => {
        // TODO Use drives as root path
        const drives = await listDrive();
        driveList.setExplorerDrives(
          drives.map((drive) => ({
            name: drive,
            callback: async (drive) => {
              file.root = drive + '\\';
              file.expanded = true;
              await file.reload(file.rootNode);
            },
          })),
        );
        const disposable = listManager.registerList(driveList);
        await listManager.start(['--normal', '--number-select', driveList.name]);
        disposable.dispose();
      },
      'list drives',
    );
  }

  file.addNodeAction(
    'search',
    async (node) => {
      await file.searchByCocList(pathLib.dirname(node.fullpath), false);
    },
    'search by coc-list',
  );

  file.addNodeAction(
    'searchRecursive',
    async (node) => {
      await file.searchByCocList(pathLib.dirname(node.fullpath), true);
    },
    'search by coc-list recursively',
  );

  file.addNodesAction(
    'gitStage',
    async (nodes) => {
      await gitManager.cmd.stage(...nodes.map((node) => node.fullpath));
      await file.reload(file.rootNode);
    },
    'add file to git index',
  );

  file.addNodesAction(
    'gitUnstage',
    async (nodes) => {
      await gitManager.cmd.unstage(...nodes.map((node) => node.fullpath));
      await file.reload(file.rootNode);
    },
    'reset file from git index',
  );
}
