import { FileSource, FileNode } from './file-source';
import pathLib from 'path';
import {
  openStrategy,
  avoidOnBufEnter,
  execNotifyBlock,
  fsExists,
  copyFileOrDirectory,
  fsRename,
  fsTrash,
  fsRimraf,
  fsMkdir,
  fsTouch,
  isWindows,
  listDrive,
} from '../../../util';
import { workspace, listManager } from 'coc.nvim';
import open from 'open';
import { driveList } from '../../../lists/drives';
import { gitManager } from '../../../git-manager';

const guardTargetPath = async (path: string) => {
  if (await fsExists(path)) {
    throw new Error(`Target file or directory ${path} already exists`);
  }
};

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
    'shrink',
    async () => {
      file.expanded = false;
      await file.reload(file.rootNode);
      await file.gotoRoot();
    },
    'shrink root node',
  );
  file.addRootAction(
    'shrinkRecursive',
    async () => {
      file.expanded = false;
      await file.shrinkNode(file.rootNode);
      await file.gotoRoot();
    },
    'shrink root node recursively',
  );

  file.addNodeAction(
    'cd',
    async (node) => {
      if (node.directory) {
        file.root = node.fullpath;
        file.expanded = true;
        await file.reload(node);
      }
    },
    'change directory to current node',
    { multi: false },
  );
  file.addNodeAction(
    'open',
    async (node) => {
      if (node.directory) {
        await file.doAction('cd', node);
      } else {
        if (openStrategy === 'vsplit') {
          await file.doAction('openInVsplit', node);
          await file.quitOnOpen();
        } else if (openStrategy === 'select') {
          await file.explorer.selectWindowsUI(
            async (winnr) => {
              await avoidOnBufEnter(async () => {
                await file.nvim.command(`${winnr}wincmd w`);
              });
              await nvim.command(`edit ${node.fullpath}`);
              await file.quitOnOpen();
            },
            async () => {
              await file.doAction('openInVsplit', node);
              await file.quitOnOpen();
            },
          );
        } else if (openStrategy === 'previousBuffer') {
          const prevWinnr = await file.prevWinnr();
          if (prevWinnr) {
            await avoidOnBufEnter(async () => {
              await nvim.command(`${prevWinnr}wincmd w`);
            });
            await nvim.command(`edit ${node.fullpath}`);
          } else {
            await file.doAction('openInVsplit', node);
          }
          await file.quitOnOpen();
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
          nvim.command(`vsplit ${node.fullpath}`, true);
          if (file.explorer.args.position === 'left') {
            nvim.command('wincmd L', true);
          } else if (file.explorer.args.position === 'right') {
            nvim.command('wincmd H', true);
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
    'shrink',
    async (node) => {
      if (node.directory && file.expandStore.isExpanded(node)) {
        await file.shrinkNode(node);
      } else if (node.parent) {
        await execNotifyBlock(async () => {
          await file.shrinkNode(node.parent!, { notify: true });
          await file.gotoNode(node.parent!, { notify: true });
        });
      } else {
        await file.doRootAction('shrink');
      }
    },
    'shrink directory',
  );
  file.addNodeAction(
    'shrinkRecursive',
    async (node) => {
      if (node.directory && file.expandStore.isExpanded(node)) {
        await file.shrinkNode(node, { recursive: true });
      } else if (node.parent) {
        await execNotifyBlock(async () => {
          await file.shrinkNode(node.parent!, { notify: true, recursive: true });
          await file.gotoNode(node.parent!, { notify: true });
        });
      } else {
        await file.doRootAction('shrinkRecursive');
      }
    },
    'shrink directory recursively',
  );
  file.addNodeAction(
    'expandOrShrink',
    async (node) => {
      if (node.directory) {
        if (file.expandStore.isExpanded(node)) {
          await file.doAction('shrink', node);
        } else {
          await file.doAction('expand', node);
        }
      }
    },
    'expand or shrink directory',
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
      file.copiedNodes.clear();
      file.cutNodes.clear();
      nodes.forEach((node) => {
        file.copiedNodes.add(node);
      });
      await file.renderNodes(nodes);
    },
    'copy file for paste',
  );
  file.addNodesAction(
    'cutFile',
    async (nodes) => {
      file.copiedNodes.clear();
      file.cutNodes.clear();
      nodes.forEach((node) => {
        file.cutNodes.add(node);
      });
      await file.renderNodes(nodes);
    },
    'cut file for paste',
  );
  file.addNodeAction(
    'pasteFile',
    async (node) => {
      const targetDir = file.getPutTargetDir(node);
      const checkNodesExists = async (
        nodes: Set<FileNode>,
        callback: (node: FileNode, targetPath: string) => Promise<void>,
      ) => {
        let canceled = false;
        for (const node of Array.from(nodes)) {
          if (canceled) {
            break;
          }
          let targetPath = pathLib.join(targetDir, node.name);
          while (true) {
            if (await fsExists(targetPath)) {
              const answer = await file.explorer.prompt(`${targetPath} already exists. Skip?`, [
                'rename',
                'skip',
                'cancel',
              ]);
              if (answer === 'skip') {
                break;
              } else if (answer === 'cancel') {
                canceled = true;
                break;
              } else if (answer === 'rename') {
                targetPath = (await nvim.call('input', [
                  `Rename: ${targetPath} -> `,
                  targetPath,
                  'file',
                ])) as string;
                continue;
              }
            } else {
              await callback(node, targetPath);
              await file.reload(file.rootNode);
              break;
            }
          }
        }
      };
      if (file.copiedNodes.size > 0) {
        await checkNodesExists(file.copiedNodes, async (node, targetPath) => {
          await copyFileOrDirectory(node.fullpath, targetPath);
        });
        await file.renderNodes(Array.from(file.copiedNodes));
        file.copiedNodes.clear();
      } else if (file.cutNodes.size > 0) {
        await checkNodesExists(file.cutNodes, async (node, targetPath) => {
          await fsRename(node.fullpath, targetPath);
        });
        await file.renderNodes(Array.from(file.cutNodes));
        file.cutNodes.clear();
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
      if (
        (await file.explorer.prompt('Move these files or directories to trash?\n' + list)) === 'yes'
      ) {
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
      if (
        (await file.explorer.prompt('Forever delete these files or directories?\n' + list)) ===
        'yes'
      ) {
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
    async (nodes) => {
      let filename = (await nvim.call('input', ['Input a new filename: ', '', 'file'])) as string;
      filename = filename.trim();
      if (!filename) {
        return;
      }
      const targetPath = pathLib.join(file.getPutTargetDir(nodes ? nodes[0] : null), filename);
      await guardTargetPath(targetPath);
      await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
      await fsTouch(targetPath);
      await file.reload(file.rootNode);
      const addedNode = await file.revealNodeByPath(targetPath, file.rootNode.children);
      if (addedNode) {
        await file.gotoNode(addedNode);
      }
    },
    'add a new file',
    { multi: false },
  );
  file.addAction(
    'addDirectory',
    async (nodes) => {
      let directoryPath = (await nvim.call('input', [
        'Input a new directory name: ',
        '',
        'file',
      ])) as string;
      directoryPath = directoryPath.trim();
      if (!directoryPath) {
        return;
      }
      const targetPath = pathLib.join(file.getPutTargetDir(nodes ? nodes[0] : null), directoryPath);
      await guardTargetPath(targetPath);
      await fsMkdir(targetPath, { recursive: true });
      await file.reload(file.rootNode);
      const addedNode = await file.revealNodeByPath(targetPath, file.rootNode.children);
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
      await guardTargetPath(targetPath);
      await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
      await fsRename(node.fullpath, targetPath);
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
