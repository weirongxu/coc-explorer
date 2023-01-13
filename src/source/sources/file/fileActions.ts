import open from 'open';
import { Notifier } from 'coc-helper';
import { window, workspace } from 'coc.nvim';
import pathLib from 'path';
import { ActionSource } from '../../../actions/actionSource';
import { driveList } from '../../../lists/drives';
import { startCocList } from '../../../lists/runner';
import { explorerWorkspaceFolderList } from '../../../lists/workspaceFolders';
import {
  CopyOrCutFileType,
  copyOrCutFileTypeList,
  RevealStrategy,
  revealStrategyList,
  rootStrategyList,
  SearchOption,
  searchOptionList,
} from '../../../types';
import {
  bufnrByWinnrOrWinid,
  currentBufnr,
  fsCopyFileRecursive,
  fsMkdirp,
  fsRename,
  fsRimraf,
  fsTouch,
  fsTrash,
  input,
  isParentFolder,
  isWindows,
  listDrive,
  logger,
  overwritePrompt,
  prompt,
  selectWindowsUI,
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
      if (/^[A-Za-z]:[\\/]$/.test(file.root)) {
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
    'rootStrategies',
    ({ args }) => {
      const originalRootStrategies: string | undefined = args[0];
      if (originalRootStrategies)
        file.rootStrategies = originalRootStrategies.split(',');
    },
    'change root strategies',
    {
      args: [
        {
          name: 'root strategies',
          description: `root strategies of ${rootStrategyList.join(' | ')}`,
        },
      ],
      menus: {
        'workspace,cwd,sourceBuffer,reveal': 'default',
        keep: 'keep current root',
      },
    },
  );
  action.addNodeAction(
    'resolveRoot',
    async ({ args, node }) => {
      const targetPath: string | undefined = args[0];
      const root = await file.explorer.rooter?.resolveRoot(
        targetPath,
        file.rootStrategies,
      );
      if (root) await action.doAction('cd', node, [root]);
    },
    'resolve and change directory to root',
    {
      args: [
        {
          name: 'reveal path',
          description: 'path string',
        },
      ],
      menus: {
        path: {
          description: 'use custom path',
          args: '<reveal-path>',
          async actionArgs() {
            return [
              await input(
                'input a reveal path:',
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
    'reveal',
    async ({ node, args }) => {
      const target: string | undefined = args[0];
      let targetBufnr: number | undefined;
      let targetPath = '';
      if (/\d+/.test(target)) {
        targetBufnr = parseInt(target, 10);
        if (targetBufnr === 0) {
          targetBufnr = await currentBufnr();
        }
      } else {
        const revealStrategy = (target ?? 'previousWindow') as RevealStrategy;

        const actions: Record<
          RevealStrategy,
          undefined | ((args?: string[]) => void | Promise<void>)
        > = {
          select: async () => {
            await selectWindowsUI(file.explorer.config, file.sourceType, {
              onSelect: async (winnr) => {
                targetBufnr = await bufnrByWinnrOrWinid(winnr);
              },
            });
          },
          sourceWindow: async () => {
            targetBufnr = await bufnrByWinnrOrWinid(
              await file.explorer.sourceWinnr(),
            );
          },
          previousBuffer: async () => {
            targetBufnr =
              await file.explorer.explorerManager.previousBufnr.get();
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

      if (!isParentFolder(file.root, targetPath)) {
        await action.doAction('resolveRoot', node, [targetPath]);
      }

      await file.view.sync(async (r) => {
        const expandOptions = args[1] ?? '';
        const compact = expandOptions.includes('compact') || undefined;
        const [revealNode, notifiers] = await file.revealNodeByPathNotifier(
          r,
          targetPath,
          {
            compact,
          },
        );
        if (revealNode) {
          await Notifier.runAll(notifiers);
        }
      });
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
      await startCocList(file.explorer, explorerWorkspaceFolderList, file, [
        '--normal',
      ]);
    },
    'change directory to current node',
  );
  action.addNodeAction(
    'drop',
    async ({ node }) => {
      if (!node.directory) {
        const quitNotifier = await file.explorer.tryQuitOnOpenNotifier();
        nvim.pauseNotification();
        nvim.command(`drop ${node.fullpath}`, true);
        quitNotifier.notify();
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
      await window.showInformationMessage('Copy filepath to clipboard');
    },
    'copy full filepath to clipboard',
  );
  action.addNodesAction(
    'copyRelativeFilepath',
    async ({ nodes }) => {
      await file.copyToClipboard(
        nodes
          ? nodes
              .map((it) => pathLib.relative(file.root, it.fullpath))
              .join('\n')
          : file.root,
      );
      await window.showInformationMessage(
        'Copy relative filepath to clipboard',
      );
    },
    'copy relative filepath to clipboard',
  );
  action.addNodesAction(
    'copyFilename',
    async ({ nodes }) => {
      await file.copyToClipboard(
        nodes
          ? nodes.map((it) => it.name).join('\n')
          : pathLib.basename(file.root),
      );
      await window.showInformationMessage('Copy filename to clipboard');
    },
    'copy filename to clipboard',
  );

  const copyOrCutFileOptions = {
    args: [
      {
        name: 'type',
        description: `${copyOrCutFileTypeList.join(' | ')}, default: replace`,
      },
    ],
    menus: {
      toggle: 'toggle copy/cut',
      append: 'append to copy/cut',
      replace: 'replace copy/cut ',
    },
  };
  action.addNodesAction(
    'copyFile',
    async ({ nodes, args }) => {
      const type = (args[0] ?? 'replace') as CopyOrCutFileType;
      const clipboardStorage = file.explorer.explorerManager.clipboardStorage;
      if (type === 'replace') {
        const content = await clipboardStorage.getFiles();
        const oldNodes = file.getNodesByPaths(content.fullpaths);
        file.view.requestRenderNodes(oldNodes);
        await clipboardStorage.setFiles(
          'copy',
          nodes.map((it) => it.fullpath),
        );
      } else if (type === 'toggle') {
        const content = await clipboardStorage.getFiles();
        const fullpathSet = new Set(content.fullpaths);
        for (const node of nodes) {
          if (fullpathSet.has(node.fullpath)) {
            fullpathSet.delete(node.fullpath);
          } else {
            fullpathSet.add(node.fullpath);
          }
        }
        await clipboardStorage.setFiles('copy', [...fullpathSet]);
      } else if (type === 'append') {
        const content = await clipboardStorage.getFiles();
        const fullpathSet = new Set(content.fullpaths);
        for (const node of nodes) {
          fullpathSet.add(node.fullpath);
        }
        await clipboardStorage.setFiles('copy', [...fullpathSet]);
      }
      file.view.requestRenderNodes(nodes);
    },
    'copy file for paste',
    copyOrCutFileOptions,
  );
  action.addNodesAction(
    'cutFile',
    async ({ nodes, args }) => {
      const type = (args[0] ?? 'replace') as CopyOrCutFileType;
      const clipboardStorage = file.explorer.explorerManager.clipboardStorage;
      if (type === 'replace') {
        const content = await clipboardStorage.getFiles();
        const oldNodes = file.getNodesByPaths(content.fullpaths);
        file.view.requestRenderNodes(oldNodes);

        await clipboardStorage.setFiles(
          'cut',
          nodes.map((it) => it.fullpath),
        );
      } else if (type === 'toggle') {
        const content = await clipboardStorage.getFiles();
        const fullpathSet = new Set(content.fullpaths);
        for (const node of nodes) {
          if (fullpathSet.has(node.fullpath)) {
            fullpathSet.delete(node.fullpath);
          } else {
            fullpathSet.add(node.fullpath);
          }
        }
        await clipboardStorage.setFiles('cut', [...fullpathSet]);
      } else if (type === 'append') {
        const content = await clipboardStorage.getFiles();
        const fullpathSet = new Set(content.fullpaths);
        for (const node of nodes) {
          fullpathSet.add(node.fullpath);
        }
        await clipboardStorage.setFiles('cut', [...fullpathSet]);
      }
      file.view.requestRenderNodes(nodes);
    },
    'cut file for paste',
    copyOrCutFileOptions,
  );
  action.addNodeAction(
    'clearCopyOrCut',
    async () => {
      const clipboardStorage = file.explorer.explorerManager.clipboardStorage;
      const content = await clipboardStorage.getFiles();
      await clipboardStorage.clear();
      file.view.requestRenderNodes(file.getNodesByPaths(content.fullpaths));
    },
    'clear cut/copy clipboard of files',
  );
  action.addNodeAction(
    'pasteFile',
    async ({ node }) => {
      const clipboardStorage = file.explorer.explorerManager.clipboardStorage;
      const content = await clipboardStorage.getFiles();
      if (content.type === 'none' || content.fullpaths.length <= 0) {
        await window.showInformationMessage(
          'Copied or cut files is empty',
          'error',
        );
        return;
      }
      const fullpaths = content.fullpaths;
      const targetNode = file.getPutTargetNode(node);
      const targetDir = targetNode.fullpath;
      let overwriteResult: { endFullpaths: string[] } | undefined;
      if (content.type === 'copy') {
        overwriteResult = await overwritePrompt(
          'paste',
          fullpaths.map((fullpath) => ({
            source: fullpath,
            target: pathLib.join(targetDir, pathLib.basename(fullpath)),
          })),
          fsCopyFileRecursive,
        );
      } else if (content.type === 'cut') {
        overwriteResult = await overwritePrompt(
          'paste',
          fullpaths.map((fullpath) => ({
            source: fullpath,
            target: pathLib.join(targetDir, pathLib.basename(fullpath)),
          })),
          fsRename,
        );
        await clipboardStorage.setFiles('cut', overwriteResult.endFullpaths);
      }
      await file.load(file.view.rootNode);
      await file.view.sync(async (r) => {
        await file.revealNodeByPathNotifier(r, fullpaths[0], {
          startNode: targetNode,
        });
      });
    },
    'paste files to here',
  );
  action.addNodesAction(
    'delete',
    async ({ nodes }) => {
      if (
        nodes.some((node) =>
          file.bufManager.modified(node.fullpath, {
            directory: node.directory,
          }),
        ) &&
        (await prompt('Buffer is being modified, discard it?')) !== 'yes'
      ) {
        return;
      }

      const list = nodes.map((node) => node.fullpath).join('\n');
      if (
        (await prompt(`Move these files or directories to trash?\n${list}`)) !==
        'yes'
      ) {
        return;
      }

      await fsTrash(nodes.map((node) => node.fullpath));

      for (const node of nodes) {
        await file.bufManager.remove(node.fullpath, {
          skipModified: true,
          bwipeout: true,
          directory: node.directory,
        });
      }
    },
    'move file or directory to trash',
    { reload: true },
  );
  action.addNodesAction(
    'deleteForever',
    async ({ nodes }) => {
      if (
        nodes.some((node) =>
          file.bufManager.modified(node.fullpath, {
            directory: node.directory,
          }),
        ) &&
        (await prompt('Buffer is being modified, discard it?')) !== 'yes'
      ) {
        return;
      }

      const list = nodes.map((node) => node.fullpath).join('\n');
      if (
        (await prompt(
          `Delete these files or directories permanently?\n${list}`,
        )) !== 'yes'
      ) {
        return;
      }

      for (const node of nodes) {
        await fsRimraf(node.fullpath, undefined);
        await file.bufManager.remove(node.fullpath, {
          skipModified: true,
          bwipeout: true,
          directory: node.directory,
        });
      }
    },
    'delete file or directory permanently',
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
      await file.view.sync(async (r) => {
        const loadNode = putTargetNode.parent ?? putTargetNode;
        const reloadNotifier = await file.loadNotifier(r, loadNode);
        const [, notifiers] = await file.revealNodeByPathNotifier(
          r,
          targetPath.replace(/(\/|\\)$/, ''),
          {
            startNode: loadNode,
          },
        );
        await Notifier.runAll([reloadNotifier, ...notifiers]);
      });
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
      await file.view.sync(async (r) => {
        const revealRoot = putTargetNode.parent ?? putTargetNode;
        const reloadNotifier = await file.loadNotifier(r, revealRoot);
        const [, revealNotifiers] = await file.revealNodeByPathNotifier(
          r,
          targetPath,
          {
            startNode: revealRoot,
          },
        );
        await Notifier.runAll([reloadNotifier, ...revealNotifiers]);
      });
    },
    'add a new directory',
  );
  action.addNodeAction(
    'rename',
    async ({ node }) => {
      if (
        file.bufManager.modified(node.fullpath, {
          directory: node.directory,
        }) &&
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

      await file.bufManager.replace(node.fullpath, targetPath, {
        skipModified: true,
        bwipeout: true,
        directory: node.directory,
      });
    },
    'rename a file or directory',
    { reload: true },
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
        await startCocList(
          file.explorer,
          driveList,
          drives.map((drive) => ({
            name: drive,
            callback: async (drive) => {
              file.root = drive;
              await file.view.expand(file.view.rootNode);
            },
          })),
          ['--normal', '--number-select'],
        );
      },
      'list drives',
    );
  }

  action.addNodeAction(
    'search',
    async ({ node, args }) => {
      const searchOptions = (args[0] ?? '').split('|') as SearchOption[];
      const recursive = searchOptions.includes('recursive');
      const strict = searchOptions.includes('strict');
      const noIgnore = searchOptions.includes('noIgnore');

      await file.searchByCocList(
        node.isRoot ? node.fullpath : pathLib.dirname(node.fullpath),
        { recursive, noIgnore, strict },
      );
    },
    'search by coc-list, the ignore function requires the fd command',
    {
      args: [
        {
          name: 'search options',
          description: searchOptionList.join(' | '),
        },
      ],
      menus: {
        noIgnore: 'no ignore',
        recursive: 'recursively',
        'recursive|noIgnore': 'recursively and no ignore',
        strict: 'exact match',
        'recursive|strict': 'recursively and strict',
      },
    },
  );

  action.addNodeAction(
    'searchRecursive',
    async ({ node }) => {
      logger.error(
        'searchRecursive action has been deprecated, please use "search:recursive" instead of it',
      );
      await file.searchByCocList(pathLib.dirname(node.fullpath), {
        recursive: true,
        noIgnore: false,
        strict: false,
      });
    },
    'search by coc-list recursively',
  );

  action.addNodeAction(
    'toggleOnlyGitChange',
    async () => {
      file.showOnlyGitChange = !file.showOnlyGitChange;
      await file.view.sync(async (r) => {
        const loadNotifier = await file.loadNotifier(r, file.view.rootNode, {
          force: true,
        });

        nvim.pauseNotification();
        file.highlight.clearHighlightsNotify();
        loadNotifier?.notify();
        await nvim.resumeNotification();
      });
    },
    'toggle visibility of git change node',
    { reload: true },
  );
}
