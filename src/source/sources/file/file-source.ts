import { events, workspace, listManager } from 'coc.nvim';
import fs from 'fs';
import open from 'open';
import pathLib from 'path';
import { diagnosticManager } from '../../../diagnostic-manager';
import { gitManager } from '../../../git-manager';
import { onError, log } from '../../../logger';
import {
  activeMode,
  autoReveal,
  avoidOnBufEnter,
  config,
  execNotifyBlock,
  onBufEnter,
  openStrategy,
  copyFileOrDirectory,
  fsAccess,
  fsExists,
  fsMkdir,
  fsReaddir,
  fsRename,
  fsRimraf,
  fsTouch,
  fsTrash,
  fsLstat,
  fsStat,
  debounce,
  listDrive,
  isWindows,
  normalizePath,
} from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, sourceIcons } from '../../source';
import { sourceManager } from '../../source-manager';
import { SourceViewBuilder } from '../../view-builder';
import { fileColumnManager } from './column-manager';
import './load';
import { driveList } from '../../../lists/drives';
import { filesList } from '../../../lists/files';
import { URI } from 'vscode-uri';

const guardTargetPath = async (path: string) => {
  if (await fsExists(path)) {
    throw new Error(`Target file or directory ${path} already exists`);
  }
};

export type FileItem = {
  uid: string;
  name: string;
  level: number;
  fullpath: string;
  directory: boolean;
  readonly: boolean;
  executable: boolean;
  readable: boolean;
  writable: boolean;
  hidden: boolean;
  symbolicLink: boolean;
  lstat: fs.Stats | null;
  isFirstInLevel: boolean;
  isLastInLevel: boolean;
  parent?: FileItem;
  children?: FileItem[];
  data: Record<string, any>;
};

export const expandStore = {
  record: {} as Record<string, boolean>,
  expand(path: string) {
    this.record[path] = true;
  },
  shrink(path: string) {
    this.record[path] = false;
  },
  isExpanded(path: string) {
    return this.record[path] || false;
  },
};

const hl = hlGroupManager.hlLinkGroupCommand.bind(hlGroupManager);
const highlights = {
  title: hl('FileRoot', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Special'),
  fullpath: hl('FileFullpath', 'Comment'),
};
hlGroupManager.register(highlights);

export class FileSource extends ExplorerSource<FileItem> {
  name = 'file';
  hlSrcId = workspace.createNameSpace('coc-explorer-file');
  hlRevealedLineSrcId = workspace.createNameSpace('coc-explorer-file-revealed-line');
  root!: string;
  showHiddenFiles: boolean = config.get<boolean>('file.showHiddenFiles')!;
  copyItems: Set<FileItem> = new Set();
  cutItems: Set<FileItem> = new Set();
  diagnosisLineIndexes: number[] = [];
  gitChangedLineIndexes: number[] = [];

  async init() {
    const { nvim } = this;

    await fileColumnManager.init(this);

    if (activeMode) {
      this.explorer.onDidInit.event(() => {
        if (!workspace.env.isVim) {
          if (autoReveal) {
            onBufEnter(200, async (bufnr) => {
              if (bufnr !== this.explorer.bufnr) {
                const bufinfo = await nvim.call('getbufinfo', [bufnr]);
                if (bufinfo[0] && bufinfo[0].name) {
                  const item = await this.revealItemByPath(bufinfo[0].name);
                  if (item !== null) {
                    await execNotifyBlock(async () => {
                      await this.render({ storeCursor: false, notify: true });
                      await this.gotoItem(item, { notify: true });
                      nvim.command('redraw', true);
                    });
                  }
                }
              }
            });
          }

          events.on(
            'BufWritePost',
            debounce(1000, async (bufnr) => {
              const bufinfo = await nvim.call('getbufinfo', [bufnr]);
              if (bufinfo[0] && bufinfo[0].name) {
                await gitManager.reload(pathLib.dirname(bufinfo[0].name as string));
                await this.render();
              }
            }),
          );

          events.on(
            ['InsertLeave', 'TextChanged'],
            debounce(1000, async () => {
              let needRender = false;
              if (fileColumnManager.columns.includes('diagnosticError')) {
                diagnosticManager.errorReload(this.root);
                if (diagnosticManager.errorNeedRender) {
                  needRender = true;
                  diagnosticManager.errorNeedRender = false;
                }
              }
              if (fileColumnManager.columns.includes('diagnosticWarning')) {
                diagnosticManager.warningReload(this.root);
                if (diagnosticManager.warningNeedRender) {
                  needRender = true;
                  diagnosticManager.warningNeedRender = false;
                }
              }
              if (needRender) {
                await this.render();
              }
            }),
          );
        } else {
          onBufEnter(200, async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.reload(null);
            }
          });
        }
      });
    }

    this.root = pathLib.join(this.explorer.args.rootPath);

    if (this.expanded) {
      expandStore.expand(this.root);
    }

    this.addAction(
      'toggleHidden',
      async () => {
        this.showHiddenFiles = !this.showHiddenFiles;
      },
      'toggle visibility of hidden files',
      { render: true, multi: false },
    );
    this.addAction(
      'gotoParent',
      async () => {
        this.root = pathLib.dirname(this.root);
        expandStore.expand(this.root);
        await this.reload(null);
      },
      'change directory to parent directory',
      { multi: false },
    );

    this.addRootAction(
      'expand',
      async () => {
        expandStore.expand(this.root);
        await this.reload(null);
      },
      'expand root node',
    );
    this.addRootAction(
      'expandRecursive',
      async () => {
        expandStore.expand(this.root);
        await this.reload(null, { render: false });
        await this.expandRecursiveItems(this.items);
      },
      'expand root node recursively',
    );
    this.addRootAction(
      'shrink',
      async () => {
        expandStore.shrink(this.root);
        await this.reload(null);
        await this.gotoRoot();
      },
      'shrink root node',
    );
    this.addRootAction(
      'shrinkRecursive',
      async () => {
        expandStore.shrink(this.root);
        await this.shrinkRecursiveItems(this.items);
        await this.render();
        await this.gotoRoot();
      },
      'shrink root node recursively',
    );

    this.addItemAction(
      'cd',
      async (item) => {
        if (item.directory) {
          this.root = item.fullpath;
          expandStore.expand(this.root);
          await this.reload(item);
        }
      },
      'change directory to current node',
      { multi: false },
    );
    this.addItemAction(
      'open',
      async (item) => {
        if (item.directory) {
          await this.doAction('cd', item);
        } else {
          if (openStrategy === 'vsplit') {
            await this.doAction('openInVsplit', item);
          } else if (openStrategy === 'select') {
            await this.selectWindowsUI(
              async (winnr) => {
                await avoidOnBufEnter(async () => {
                  await this.nvim.command(`${winnr}wincmd w`);
                });
                await nvim.command(`edit ${item.fullpath}`);
              },
              async () => {
                await this.doAction('openInVsplit', item);
              },
            );
          } else if (openStrategy === 'previousBuffer') {
            const prevWinnr = await this.prevWinnr();
            if (prevWinnr) {
              await avoidOnBufEnter(async () => {
                await nvim.command(`${prevWinnr}wincmd w`);
              });
              await nvim.command(`edit ${item.fullpath}`);
            } else {
              await this.doAction('openInVsplit', item);
            }
          }
        }
      },
      'open file or directory',
      { multi: false },
    );
    this.addItemAction(
      'openInSplit',
      async (item) => {
        if (!item.directory) {
          await nvim.command(`split ${item.fullpath}`);
        }
      },
      'open file via split command',
    );
    this.addItemAction(
      'openInVsplit',
      async (item) => {
        if (!item.directory) {
          await execNotifyBlock(() => {
            nvim.command(`vsplit ${item.fullpath}`, true);
            if (this.explorer.position === 'left') {
              nvim.command('wincmd L', true);
            } else {
              nvim.command('wincmd H', true);
            }
          });
        }
      },
      'open file via vsplit command',
    );
    this.addItemAction(
      'openInTab',
      async (item) => {
        if (!item.directory) {
          await nvim.command(`tabedit ${item.fullpath}`);
        }
      },
      'open file in tab',
    );
    this.addItemAction(
      'drop',
      async (item) => {
        if (item.directory) {
          await this.doAction('expand', item);
        } else {
          await nvim.command(`drop ${item.fullpath}`);
        }
      },
      'open file via drop command',
    );
    this.addItemAction(
      'expand',
      async (item) => {
        if (item.directory) {
          const expandRecursive = async (item: FileItem) => {
            expandStore.expand(item.fullpath);
            if (!item.children) {
              item.children = await this.listFiles(item.fullpath, item);
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
          await this.render();
        } else {
          await this.doAction('open', item);
        }
      },
      'expand directory or open file',
    );
    this.addItemAction(
      'expandRecursive',
      async (item) => {
        await this.expandRecursiveItems([item]);
        await this.render();
      },
      'expand directory recursively',
    );
    this.addItemAction(
      'shrink',
      async (item) => {
        if (item.directory && expandStore.isExpanded(item.fullpath)) {
          expandStore.shrink(item.fullpath);
          await this.render();
        } else if (item.parent) {
          expandStore.shrink(item.parent.fullpath);
          await execNotifyBlock(async () => {
            await this.render({ notify: true });
            await this.gotoItem(item.parent!, { notify: true });
          });
        } else {
          await this.doRootAction('shrink');
        }
      },
      'shrink directory',
    );
    this.addItemAction(
      'shrinkRecursive',
      async (item) => {
        if (item.directory && expandStore.isExpanded(item.fullpath)) {
          await this.shrinkRecursiveItems([item]);
        } else if (item.parent) {
          expandStore.shrink(item.parent.fullpath);
          if (item.parent.children) {
            await this.shrinkRecursiveItems(item.parent.children);
          }
          await this.gotoItem(item.parent);
        } else {
          await this.doRootAction('shrinkRecursive');
        }
        await this.render();
      },
      'shrink directory recursively',
    );
    this.addItemAction(
      'expandOrShrink',
      async (item) => {
        if (item.directory) {
          if (expandStore.isExpanded(item.fullpath)) {
            await this.doAction('shrink', item);
          } else {
            await this.doAction('expand', item);
          }
        }
      },
      'expand or shrink directory',
    );

    this.addAction(
      'copyFilepath',
      async (items) => {
        await this.copy(items ? items.map((it) => it.fullpath).join('\n') : this.root);
        // tslint:disable-next-line: ban
        workspace.showMessage('Copy filepath to clipboard');
      },
      'copy full filepath to clipboard',
    );
    this.addAction(
      'copyFilename',
      async (items) => {
        await this.copy(items ? items.map((it) => it.name).join('\n') : pathLib.basename(this.root));
        // tslint:disable-next-line: ban
        workspace.showMessage('Copy filename to clipboard');
      },
      'copy filename to clipboard',
    );
    this.addItemsAction(
      'copyFile',
      async (items) => {
        this.copyItems.clear();
        this.cutItems.clear();
        items.forEach((item) => {
          this.copyItems.add(item);
        });
      },
      'copy file for paste',
      { render: true },
    );
    this.addItemsAction(
      'cutFile',
      async (items) => {
        this.copyItems.clear();
        this.cutItems.clear();
        items.forEach((item) => {
          this.cutItems.add(item);
        });
      },
      'cut file for paste',
      { render: true },
    );
    this.addItemAction(
      'pasteFile',
      async (item) => {
        const targetDir = this.getPutTargetDir(item);
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
                const answer = await this.explorer.prompt(`${targetPath} already exists. Skip?`, [
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
                await this.reload(null);
                break;
              }
            }
          }
        };
        if (this.copyItems.size > 0) {
          await checkItemsExists(this.copyItems, async (item, targetPath) => {
            await copyFileOrDirectory(item.fullpath, targetPath);
          });
          this.copyItems.clear();
          await this.render();
        } else if (this.cutItems.size > 0) {
          await checkItemsExists(this.cutItems, async (item, targetPath) => {
            await fsRename(item.fullpath, targetPath);
          });
          this.cutItems.clear();
          await this.render();
        }
      },
      'paste files to here',
      { multi: false },
    );
    this.addItemsAction(
      'delete',
      async (items) => {
        const list = items.map((item) => item.fullpath).join('\n');
        if ((await this.explorer.prompt('Move these files or directories to trash?\n' + list)) === 'yes') {
          await fsTrash(items.map((item) => item.fullpath));
        }
      },
      'move file or directory to trash',
      { reload: true },
    );
    this.addItemsAction(
      'deleteForever',
      async (items) => {
        const list = items.map((item) => item.fullpath).join('\n');
        if ((await this.explorer.prompt('Forever delete these files or directories?\n' + list)) === 'yes') {
          for (const item of items) {
            await fsRimraf(item.fullpath);
          }
        }
      },
      'delete file or directory forever',
      { reload: true },
    );

    this.addAction(
      'addFile',
      async (items) => {
        let filename = (await nvim.call('input', ['Input a new filename: ', '', 'file'])) as string;
        filename = filename.trim();
        if (!filename) {
          return;
        }
        const targetPath = pathLib.join(this.getPutTargetDir(items ? items[0] : null), filename);
        await guardTargetPath(targetPath);
        await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
        await fsTouch(targetPath);
        await this.reload(null);
        const addedItem = await this.revealItemByPath(targetPath);
        if (addedItem) {
          await this.gotoItem(addedItem);
        }
      },
      'add a new file',
      { multi: false },
    );
    this.addAction(
      'addDirectory',
      async (items) => {
        let directoryPath = (await nvim.call('input', ['Input a new directory name: ', '', 'file'])) as string;
        directoryPath = directoryPath.trim();
        if (!directoryPath) {
          return;
        }
        const targetPath = pathLib.join(this.getPutTargetDir(items ? items[0] : null), directoryPath);
        await guardTargetPath(targetPath);
        await fsMkdir(targetPath, { recursive: true });
        await this.reload(null);
        const addedItem = await this.revealItemByPath(targetPath);
        if (addedItem) {
          await this.gotoItem(addedItem);
        }
      },
      'add a new directory',
      { multi: false },
    );
    this.addItemAction(
      'rename',
      async (item) => {
        const targetPath = (await nvim.call('input', [`Rename: ${item.fullpath} ->`, item.fullpath, 'file'])) as string;
        if (targetPath.length == 0) {
          return;
        }
        await guardTargetPath(targetPath);
        await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
        await fsRename(item.fullpath, targetPath);
        await this.reload(null);
      },
      'rename a file or directory',
      { multi: false },
    );

    this.addAction(
      'systemExecute',
      async (items) => {
        if (items) {
          await Promise.all(items.map((item) => open(item.fullpath)));
        } else {
          await open(this.root);
        }
      },
      'use system application open file or directory',
      { multi: true },
    );

    if (isWindows) {
      this.addAction(
        'listDrive',
        async () => {
          const drives = await listDrive();
          driveList.setExplorerDrives(
            drives.map((drive) => ({
              name: drive,
              callback: async (drive) => {
                this.root = drive + '\\';
                expandStore.expand(this.root);
                await this.reload(null);
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

    this.addAction(
      'search',
      async (items) => {
        await this.searchByCocList(items ? pathLib.dirname(items[0].fullpath) : this.root, false);
      },
      'search by coc-list',
      { multi: false },
    );

    this.addAction(
      'searchRecursive',
      async (items) => {
        await this.searchByCocList(items ? pathLib.dirname(items[0].fullpath) : this.root, true);
      },
      'search by coc-list recursively',
      { multi: false },
    );

    this.addItemsAction(
      'gitStage',
      async (items) => {
        await gitManager.cmd.stage(...items.map((item) => item.fullpath));
        await this.reload(null);
      },
      'add file to git index',
    );

    this.addItemsAction(
      'gitUnstage',
      async (items) => {
        await gitManager.cmd.unstage(...items.map((item) => item.fullpath));
        await this.reload(null);
      },
      'reset file from git index',
    );
  }

  getPutTargetDir(item: FileItem | null) {
    return item === null
      ? this.root
      : item.directory && expandStore.isExpanded(item.fullpath)
      ? item.fullpath
      : item.parent
      ? item.parent.fullpath
      : this.root;
  }

  async searchByCocList(path: string, recursive: boolean) {
    filesList.ignore = !this.showHiddenFiles;
    filesList.rootPath = path;
    filesList.recursive = recursive;
    filesList.revealCallback = async (loc) => {
      const item = await this.revealItemByPath(URI.parse(loc.uri).fsPath);
      if (item !== null) {
        await execNotifyBlock(async () => {
          await this.render({ storeCursor: false, notify: true });
          await this.gotoItem(item, { notify: true });
          this.nvim.command('redraw', true);
        });
      }
    };
    const disposable = listManager.registerList(filesList);
    await listManager.start([filesList.name]);
    disposable.dispose();
  }

  async revealItemByPath(path: string, items: FileItem[] = this.items): Promise<FileItem | null> {
    path = normalizePath(path);
    for (const item of items) {
      if (item.directory && path.startsWith(item.fullpath + pathLib.sep)) {
        expandStore.expand(item.fullpath);
        if (!item.children) {
          item.children = await this.listFiles(item.fullpath, item);
        }
        return await this.revealItemByPath(path, item.children);
      } else if (path === item.fullpath) {
        return item;
      }
    }
    return null;
  }

  sortFiles(files: FileItem[]) {
    return files.sort((a, b) => {
      if (a.directory && !b.directory) {
        return -1;
      } else if (b.directory && !a.directory) {
        return 1;
      } else {
        return a.name.localeCompare(b.name);
      }
    });
  }

  async listFiles(path: string, parent: FileItem | null) {
    const files = await fsReaddir(path);
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const fullpath = pathLib.join(path, file);
          const stat = await fsStat(fullpath).catch(() => {});
          const lstat = await fsLstat(fullpath).catch(() => {});
          const executable = await fsAccess(fullpath, fs.constants.X_OK);
          const writable = await fsAccess(fullpath, fs.constants.W_OK);
          const readable = await fsAccess(fullpath, fs.constants.R_OK);
          const item: FileItem = {
            uid: this.name + '-' + fullpath,
            name: file,
            level: parent ? parent.level + 1 : 1,
            fullpath,
            directory: stat ? stat.isDirectory() : false,
            readonly: !writable && readable,
            executable,
            readable,
            writable,
            hidden: file.startsWith('.'),
            symbolicLink: lstat ? lstat.isSymbolicLink() : false,
            isFirstInLevel: false,
            isLastInLevel: false,
            lstat: lstat || null,
            parent: parent || undefined,
            data: {},
          };
          if (expandStore.isExpanded(item.fullpath)) {
            item.children = await this.listFiles(item.fullpath, item);
          }
          return item;
        } catch (error) {
          onError(error);
          return null;
        }
      }),
    );

    return this.sortFiles(results.filter((r): r is FileItem => r !== null));
  }

  async expandRecursiveItems(items: FileItem[]) {
    await Promise.all(
      items.map(async (item) => {
        if (item.directory) {
          expandStore.expand(item.fullpath);
          if (!item.children) {
            item.children = await this.listFiles(item.fullpath, item);
          }
          await this.expandRecursiveItems(item.children);
        }
      }),
    );
  }

  async shrinkRecursiveItems(items: FileItem[]) {
    await Promise.all(
      items.map(async (item) => {
        if (item.directory) {
          expandStore.shrink(item.fullpath);
          if (item.children) {
            await this.shrinkRecursiveItems(item.children);
          }
        }
      }),
    );
  }

  async loadItems(_sourceItem: FileItem | null): Promise<FileItem[]> {
    this.copyItems.clear();
    this.cutItems.clear();
    if (expandStore.isExpanded(this.root)) {
      return this.listFiles(this.root, null);
    } else {
      return [];
    }
  }

  async loaded(sourceItem: FileItem | null) {
    await fileColumnManager.load(sourceItem);
  }

  async draw(builder: SourceViewBuilder<FileItem>) {
    await fileColumnManager.beforeDraw();

    const rootExpanded = expandStore.isExpanded(this.root);
    builder.newRoot((row) => {
      row.add(rootExpanded ? sourceIcons.expanded : sourceIcons.shrinked, highlights.expandIcon);
      row.add(' ');
      row.add(`[FILE${this.showHiddenFiles ? ' I' : ''}]:`, highlights.title);
      row.add(' ');
      row.add(pathLib.basename(this.root));
      row.add(' ');
      row.add(this.root, highlights.fullpath);
    });
    const drawSubDirectory = (items: FileItem[]) => {
      items.forEach((item) => {
        item.isFirstInLevel = false;
        item.isLastInLevel = false;
      });
      const filteredItems = this.showHiddenFiles ? items : items.filter((item) => !item.hidden);
      if (filteredItems.length > 0) {
        filteredItems[0].isFirstInLevel = true;
        filteredItems[filteredItems.length - 1].isLastInLevel = true;
      }
      for (const item of filteredItems) {
        builder.newItem(item, (row) => {
          fileColumnManager.drawItem(row, item);
        });
        if (expandStore.isExpanded(item.fullpath) && item.children) {
          drawSubDirectory(item.children);
        }
      }
    };
    if (rootExpanded) {
      drawSubDirectory(this.items);
    }
  }
}

sourceManager.registerSource(new FileSource());
