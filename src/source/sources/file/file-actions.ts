import { FileSource } from './file-source';
import pathLib from 'path';
import {
  avoidOnBufEnter,
  execNotifyBlock,
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
} from '../../../util';
import { workspace, listManager } from 'coc.nvim';
import open from 'open';
import { driveList } from '../../../lists/drives';
import { gitManager } from '../../../git-manager';
import { argOptions } from '../../../parse-args';
import { onError } from '../../../logger';

export function initFileActions(file: FileSource) {
  const { nvim } = file;

  file.addAction(
    'gotoParent',
    async () => {
      file.root = pathLib.dirname(file.root);
      file.expandStore.expand(file.rootNode);
      await file.reload(file.rootNode);
    },
    'change directory to parent directory',
    { multi: false },
  );

  file.addRootAction(
    'expand',
    async () => {
      file.expanded = true;
      await file.reload(file.rootNode);
    },
    'expand root node',
  );
  file.addRootAction(
    'expandRecursive',
    async () => {
      await file.expandNode(file.rootNode, { recursive: true });
    },
    'expand root node recursively',
  );
  file.addRootAction(
    'collapse',
    async () => {
      file.expanded = false;
      await file.reload(file.rootNode);
      await file.gotoRoot();
    },
    'collapse root node',
  );
  file.addRootAction(
    'collapseRecursive',
    async () => {
      file.expanded = false;
      await file.collapseNode(file.rootNode);
      await file.gotoRoot();
    },
    'collapse root node recursively',
  );

  file.addNodeAction(
    'cd',
    async (node) => {
      if (node.directory) {
        file.root = node.fullpath;
        file.expanded = true;
        await file.reload(file.rootNode);
      }
    },
    'change directory to current node',
    { multi: false },
  );
  file.addNodeAction(
    'open',
    async (node) => {
      if (node.directory) {
        if (config.get<boolean>('openAction.changeDirectory')!) {
          await file.doAction('cd', node);
        } else {
          await file.doAction('expandOrCollapse', node);
        }
      } else {
        try {
          await file.openAction(node, async (winnr) => {
            await avoidOnBufEnter(async () => {
              await file.nvim.command(`${winnr}wincmd w`);
            });

            await nvim.command(`edit ${node.fullpath}`);
          });
        }
        catch (e) {
          onError(e.message);
        }
      }
    },
    'open file or directory',
    { multi: false },
  );
  file.addNodeAction(
    'openInSplit',
    async (node) => {
      if (!node.directory) {
        await nvim.command(`split ${node.fullpath}`);
        await file.quitOnOpen();
      }
    },
    'open file via split command',
  );
  file.addNodeAction(
    'openInVsplit',
    async (node) => {
      if (!node.directory) {
        await execNotifyBlock(async () => {
          const position = await file.explorer.args.value(argOptions.position);
          nvim.command(`vsplit ${node.fullpath}`, true);
          if (position === 'left') {
            nvim.command('wincmd L', true);
          } else if (position === 'right') {
            nvim.command('wincmd H', true);
          } else if (position === 'tab') {
            nvim.command('wincmd L', true);
          }
          await file.quitOnOpen();
        });
      }
    },
    'open file via vsplit command',
  );
  file.addNodeAction(
    'openInTab',
    async (node) => {
      if (!node.directory) {
        await file.quitOnOpen();
        await nvim.command(`tabedit ${node.fullpath}`);
      }
    },
    'open file in tab',
  );
  file.addNodeAction(
    'drop',
    async (node) => {
      if (node.directory) {
        await file.doAction('expand', node);
      } else {
        await nvim.command(`drop ${node.fullpath}`);
        await file.quitOnOpen();
      }
    },
    'open file via drop command',
  );
  file.addNodeAction(
    'expand',
    async (node) => {
      if (node.directory) {
        await file.expandNode(node);
      } else {
        await file.doAction('open', node);
      }
    },
    'expand directory or open file',
  );
  file.addNodeAction(
    'expandRecursive',
    async (node) => {
      await file.expandNode(node, { recursive: true });
    },
    'expand directory recursively',
  );
  file.addNodeAction(
    'collapse',
    async (node) => {
      if (node.directory && file.expandStore.isExpanded(node)) {
        await file.collapseNode(node);
      } else if (node.parent) {
        await execNotifyBlock(async () => {
          await file.collapseNode(node.parent!, { notify: true });
          await file.gotoNode(node.parent!, { notify: true });
        });
      } else {
        await file.doRootAction('collapse');
      }
    },
    'collapse directory',
  );
  file.addNodeAction(
    'collapseRecursive',
    async (node) => {
      if (node.directory && file.expandStore.isExpanded(node)) {
        await file.collapseNode(node, { recursive: true });
      } else if (node.parent) {
        await execNotifyBlock(async () => {
          await file.collapseNode(node.parent!, { notify: true, recursive: true });
          await file.gotoNode(node.parent!, { notify: true });
        });
      } else {
        await file.doRootAction('collapseRecursive');
      }
    },
    'collapse directory recursively',
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
  );

  file.addAction(
    'copyFilepath',
    async (nodes) => {
      await file.copy(nodes ? nodes.map((it) => it.fullpath).join('\n') : file.root);
      // tslint:disable-next-line: ban
      workspace.showMessage('Copy filepath to clipboard');
    },
    'copy full filepath to clipboard',
  );
  file.addAction(
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
    { multi: false },
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

  file.addAction(
    'addFile',
    async (nodes, arg) => {
      let filename =
        arg ?? ((await nvim.call('input', ['Input a new filename: ', '', 'file'])) as string);
      filename = filename.trim();
      if (!filename) {
        return;
      }
      if (filename.endsWith('/') || filename.endsWith('\\')) {
        if (nodes) {
          await file.doAction('addDirectory', nodes, filename);
        } else {
          await file.doRootAction('addDirectory', filename);
        }
        return;
      }
      const putTargetNode = file.getPutTargetNode(nodes ? nodes[0] : null);
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
      const addedNode = await file.revealNodeByPath(targetPath, {
        node: putTargetNode,
        render: true,
      });
      if (addedNode) {
        await file.gotoNode(addedNode);
      }
    },
    'add a new file',
    { multi: false },
  );
  file.addAction(
    'addDirectory',
    async (nodes, arg) => {
      let directoryName =
        arg ?? ((await nvim.call('input', ['Input a new directory name: ', '', 'file'])) as string);
      directoryName = directoryName.trim().replace(/(\/|\\)*$/g, '');
      if (!directoryName) {
        return;
      }
      const putTargetNode = file.getPutTargetNode(nodes ? nodes[0] : null);
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
      await file.reload(putTargetNode);
      const addedNode = await file.revealNodeByPath(targetPath, {
        node: putTargetNode,
        render: true,
      });
      if (addedNode) {
        await file.gotoNode(addedNode);
      }
    },
    'add a new directory',
    { multi: false },
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
    { multi: false },
  );

  file.addAction(
    'systemExecute',
    async (nodes) => {
      if (nodes) {
        await Promise.all(nodes.map((node) => open(node.fullpath)));
      } else {
        await open(file.root);
      }
    },
    'use system application open file or directory',
    { multi: true },
  );

  if (isWindows) {
    file.addAction(
      'listDrive',
      async () => {
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
      { multi: false },
    );
  }

  file.addAction(
    'search',
    async (nodes) => {
      await file.searchByCocList(nodes ? pathLib.dirname(nodes[0].fullpath) : file.root, false);
    },
    'search by coc-list',
    { multi: false },
  );

  file.addAction(
    'searchRecursive',
    async (nodes) => {
      await file.searchByCocList(nodes ? pathLib.dirname(nodes[0].fullpath) : file.root, true);
    },
    'search by coc-list recursively',
    { multi: false },
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
