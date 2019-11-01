import { FileSource, expandStore, FileItem } from './file-source';
import pathLib from 'path';
import {
  openStrategy,
  avoidOnBufEnter,
  execNotifyBlock,
  config,
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
    'toggleHidden',
    async () => {
      file.showHiddenFiles = !file.showHiddenFiles;
    },
    'toggle visibility of hidden files',
    { render: true, multi: false },
  );
  file.addAction(
    'gotoParent',
    async () => {
      file.root = pathLib.dirname(file.root);
      expandStore.expand(file.root);
      await file.reload(null);
    },
    'change directory to parent directory',
    { multi: false },
  );

  file.addRootAction(
    'expand',
    async () => {
      expandStore.expand(file.root);
      await file.reload(null);
    },
    'expand root node',
  );
  file.addRootAction(
    'expandRecursive',
    async () => {
      expandStore.expand(file.root);
      await file.reload(null, { render: false });
      await file.expandRecursiveItems(file.items);
    },
    'expand root node recursively',
  );
  file.addRootAction(
    'shrink',
    async () => {
      expandStore.shrink(file.root);
      await file.reload(null);
      await file.gotoRoot();
    },
    'shrink root node',
  );
  file.addRootAction(
    'shrinkRecursive',
    async () => {
      expandStore.shrink(file.root);
      await file.shrinkRecursiveItems(file.items);
      await file.render();
      await file.gotoRoot();
    },
    'shrink root node recursively',
  );

  file.addItemAction(
    'cd',
    async (item) => {
      if (item.directory) {
        file.root = item.fullpath;
        expandStore.expand(file.root);
        await file.reload(item);
      }
    },
    'change directory to current node',
    { multi: false },
  );
  file.addItemAction(
    'open',
    async (item) => {
      if (item.directory) {
        await file.doAction('cd', item);
      } else {
        if (openStrategy === 'vsplit') {
          await file.doAction('openInVsplit', item);
        } else if (openStrategy === 'select') {
          await file.explorer.selectWindowsUI(
            async (winnr) => {
              await avoidOnBufEnter(async () => {
                await file.nvim.command(`${winnr}wincmd w`);
              });
              await nvim.command(`edit ${item.fullpath}`);
            },
            async () => {
              await file.doAction('openInVsplit', item);
            },
          );
        } else if (openStrategy === 'previousBuffer') {
          const prevWinnr = await file.prevWinnr();
          if (prevWinnr) {
            await avoidOnBufEnter(async () => {
              await nvim.command(`${prevWinnr}wincmd w`);
            });
            await nvim.command(`edit ${item.fullpath}`);
          } else {
            await file.doAction('openInVsplit', item);
          }
        }
        await file.openedItem();
      }
    },
    'open file or directory',
    { multi: false },
  );
  file.addItemAction(
    'openInSplit',
    async (item) => {
      if (!item.directory) {
        await nvim.command(`split ${item.fullpath}`);
        await file.openedItem();
      }
    },
    'open file via split command',
  );
  file.addItemAction(
    'openInVsplit',
    async (item) => {
      if (!item.directory) {
        await execNotifyBlock(() => {
          nvim.command(`vsplit ${item.fullpath}`, true);
          if (file.explorer.position === 'left') {
            nvim.command('wincmd L', true);
          } else {
            nvim.command('wincmd H', true);
          }
        });
        await file.openedItem();
      }
    },
    'open file via vsplit command',
  );
  file.addItemAction(
    'openInTab',
    async (item) => {
      if (!item.directory) {
        await nvim.command(`tabedit ${item.fullpath}`);
        await file.openedItem();
      }
    },
    'open file in tab',
  );
  file.addItemAction(
    'drop',
    async (item) => {
      if (item.directory) {
        await file.doAction('expand', item);
      } else {
        await nvim.command(`drop ${item.fullpath}`);
        await file.openedItem();
      }
    },
    'open file via drop command',
  );
  file.addItemAction(
    'expand',
    async (item) => {
      if (item.directory) {
        const expandRecursive = async (item: FileItem) => {
          expandStore.expand(item.fullpath);
          if (!item.children) {
            item.children = await file.listFiles(item.fullpath, item);
          }
          if (
            item.children.length === 1 &&
            item.children[0].directory &&
            config.get<boolean>('file.autoExpandSingleDirectory')!
          ) {
            await expandRecursive(item.children[0]);
          }
        };
        await expandRecursive(item);
        await file.render();
      } else {
        await file.doAction('open', item);
      }
    },
    'expand directory or open file',
  );
  file.addItemAction(
    'expandRecursive',
    async (item) => {
      await file.expandRecursiveItems([item]);
      await file.render();
    },
    'expand directory recursively',
  );
  file.addItemAction(
    'shrink',
    async (item) => {
      if (item.directory && expandStore.isExpanded(item.fullpath)) {
        expandStore.shrink(item.fullpath);
        await file.render();
      } else if (item.parent) {
        expandStore.shrink(item.parent.fullpath);
        await execNotifyBlock(async () => {
          await file.render({ notify: true });
          await file.gotoItem(item.parent!, { notify: true });
        });
      } else {
        await file.doRootAction('shrink');
      }
    },
    'shrink directory',
  );
  file.addItemAction(
    'shrinkRecursive',
    async (item) => {
      if (item.directory && expandStore.isExpanded(item.fullpath)) {
        await file.shrinkRecursiveItems([item]);
      } else if (item.parent) {
        expandStore.shrink(item.parent.fullpath);
        if (item.parent.children) {
          await file.shrinkRecursiveItems(item.parent.children);
        }
        await file.gotoItem(item.parent);
      } else {
        await file.doRootAction('shrinkRecursive');
      }
      await file.render();
    },
    'shrink directory recursively',
  );
  file.addItemAction(
    'expandOrShrink',
    async (item) => {
      if (item.directory) {
        if (expandStore.isExpanded(item.fullpath)) {
          await file.doAction('shrink', item);
        } else {
          await file.doAction('expand', item);
        }
      }
    },
    'expand or shrink directory',
  );

  file.addAction(
    'copyFilepath',
    async (items) => {
      await file.copy(items ? items.map((it) => it.fullpath).join('\n') : file.root);
      // tslint:disable-next-line: ban
      workspace.showMessage('Copy filepath to clipboard');
    },
    'copy full filepath to clipboard',
  );
  file.addAction(
    'copyFilename',
    async (items) => {
      await file.copy(items ? items.map((it) => it.name).join('\n') : pathLib.basename(file.root));
      // tslint:disable-next-line: ban
      workspace.showMessage('Copy filename to clipboard');
    },
    'copy filename to clipboard',
  );
  file.addItemsAction(
    'copyFile',
    async (items) => {
      file.copyItems.clear();
      file.cutItems.clear();
      items.forEach((item) => {
        file.copyItems.add(item);
      });
    },
    'copy file for paste',
    { render: true },
  );
  file.addItemsAction(
    'cutFile',
    async (items) => {
      file.copyItems.clear();
      file.cutItems.clear();
      items.forEach((item) => {
        file.cutItems.add(item);
      });
    },
    'cut file for paste',
    { render: true },
  );
  file.addItemAction(
    'pasteFile',
    async (item) => {
      const targetDir = file.getPutTargetDir(item);
      const checkItemsExists = async (
        items: Set<FileItem>,
        callback: (item: FileItem, targetPath: string) => Promise<void>,
      ) => {
        let canceled = false;
        for (const item of Array.from(items)) {
          if (canceled) {
            break;
          }
          let targetPath = pathLib.join(targetDir, item.name);
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
                targetPath = (await nvim.call('input', [`Rename: ${targetPath} -> `, targetPath, 'file'])) as string;
                continue;
              }
            } else {
              await callback(item, targetPath);
              await file.reload(null);
              break;
            }
          }
        }
      };
      if (file.copyItems.size > 0) {
        await checkItemsExists(file.copyItems, async (item, targetPath) => {
          await copyFileOrDirectory(item.fullpath, targetPath);
        });
        file.copyItems.clear();
        await file.render();
      } else if (file.cutItems.size > 0) {
        await checkItemsExists(file.cutItems, async (item, targetPath) => {
          await fsRename(item.fullpath, targetPath);
        });
        file.cutItems.clear();
        await file.render();
      } else {
        // tslint:disable-next-line: ban
        workspace.showMessage('Copy items or cut items is empty', 'error');
      }
    },
    'paste files to here',
    { multi: false },
  );
  file.addItemsAction(
    'delete',
    async (items) => {
      const list = items.map((item) => item.fullpath).join('\n');
      if ((await file.explorer.prompt('Move these files or directories to trash?\n' + list)) === 'yes') {
        await fsTrash(items.map((item) => item.fullpath));
      }
    },
    'move file or directory to trash',
    { reload: true },
  );
  file.addItemsAction(
    'deleteForever',
    async (items) => {
      const list = items.map((item) => item.fullpath).join('\n');
      if ((await file.explorer.prompt('Forever delete these files or directories?\n' + list)) === 'yes') {
        for (const item of items) {
          await fsRimraf(item.fullpath);
        }
      }
    },
    'delete file or directory forever',
    { reload: true },
  );

  file.addAction(
    'addFile',
    async (items) => {
      let filename = (await nvim.call('input', ['Input a new filename: ', '', 'file'])) as string;
      filename = filename.trim();
      if (!filename) {
        return;
      }
      const targetPath = pathLib.join(file.getPutTargetDir(items ? items[0] : null), filename);
      await guardTargetPath(targetPath);
      await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
      await fsTouch(targetPath);
      await file.reload(null);
      const addedItem = await file.revealItemByPath(targetPath);
      if (addedItem) {
        await file.gotoItem(addedItem);
      }
    },
    'add a new file',
    { multi: false },
  );
  file.addAction(
    'addDirectory',
    async (items) => {
      let directoryPath = (await nvim.call('input', ['Input a new directory name: ', '', 'file'])) as string;
      directoryPath = directoryPath.trim();
      if (!directoryPath) {
        return;
      }
      const targetPath = pathLib.join(file.getPutTargetDir(items ? items[0] : null), directoryPath);
      await guardTargetPath(targetPath);
      await fsMkdir(targetPath, { recursive: true });
      await file.reload(null);
      const addedItem = await file.revealItemByPath(targetPath);
      if (addedItem) {
        await file.gotoItem(addedItem);
      }
    },
    'add a new directory',
    { multi: false },
  );
  file.addItemAction(
    'rename',
    async (item) => {
      const targetPath = (await nvim.call('input', [`Rename: ${item.fullpath} ->`, item.fullpath, 'file'])) as string;
      if (targetPath.length == 0) {
        return;
      }
      await guardTargetPath(targetPath);
      await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
      await fsRename(item.fullpath, targetPath);
      await file.reload(null);
    },
    'rename a file or directory',
    { multi: false },
  );

  file.addAction(
    'systemExecute',
    async (items) => {
      if (items) {
        await Promise.all(items.map((item) => open(item.fullpath)));
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
              expandStore.expand(file.root);
              await file.reload(null);
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
    async (items) => {
      await file.searchByCocList(items ? pathLib.dirname(items[0].fullpath) : file.root, false);
    },
    'search by coc-list',
    { multi: false },
  );

  file.addAction(
    'searchRecursive',
    async (items) => {
      await file.searchByCocList(items ? pathLib.dirname(items[0].fullpath) : file.root, true);
    },
    'search by coc-list recursively',
    { multi: false },
  );

  file.addItemsAction(
    'gitStage',
    async (items) => {
      await gitManager.cmd.stage(...items.map((item) => item.fullpath));
      await file.reload(null);
    },
    'add file to git index',
  );

  file.addItemsAction(
    'gitUnstage',
    async (items) => {
      await gitManager.cmd.unstage(...items.map((item) => item.fullpath));
      await file.reload(null);
    },
    'reset file from git index',
  );
}
