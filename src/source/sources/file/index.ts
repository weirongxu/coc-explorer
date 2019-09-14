import { workspace, events } from 'coc.nvim';
import fs from 'fs';
import pathLib from 'path';
import { promisify } from 'util';
import { ExplorerSource } from '../../';
import { SourceViewBuilder } from '../../view-builder';
import { sourceManager } from '../../source-manager';
import { hlGroupManager } from '../../highlight-manager';
import { fileColumnManager } from './column-manager';
import './load';
import { onError } from '../../../logger';
import { config, openStrategy, activeMode, supportBufferHighlight, autoReveal } from '../../../util';
import trash from 'trash';
import rimraf from 'rimraf';
import open from 'open';
import { debounce } from 'throttle-debounce';
import { diagnosticUI } from './diagnostic-ui';
import { gitManager } from '../../../git-manager';
import { gitChangedLineIndexs } from './columns/git';

const fsOpen = promisify(fs.open);
const fsClose = promisify(fs.close);
const fsTouch = async (path: string) => await fsClose(await fsOpen(path, 'w'));
const fsMkdir = promisify(fs.mkdir);
const fsReaddir = promisify(fs.readdir);
const fsAccess = (path: string, mode?: number) =>
  new Promise<boolean>((resolve) => {
    fs.access(path, mode, (err) => {
      err ? resolve(false) : resolve(true);
    });
  });
const fsExists = fsAccess;
const fsStat = promisify(fs.stat);
const fsCopyFile = promisify(fs.copyFile);
const fsRename = promisify(fs.rename);
const fsTrash = (paths: string | string[]) => trash(paths, { glob: false });
const fsRimraf = promisify(rimraf);

const copyFileOrDirectory = async (sourcePath: string, targetPath: string) => {
  const stat = await fsStat(sourcePath);
  if (stat.isDirectory()) {
    await fsMkdir(targetPath);
    const files = await fsReaddir(sourcePath);
    for (const filename of files) {
      await copyFileOrDirectory(pathLib.join(sourcePath, filename), pathLib.join(targetPath, filename));
    }
  } else {
    await fsCopyFile(sourcePath, targetPath);
  }
};

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
  stat: fs.Stats;
  isLastInLevel: boolean;
  parent?: FileItem;
  children?: FileItem[];
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

const hl = hlGroupManager.hlLinkGroupCommand;

const highlights = {
  title: hl('FileRoot', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Special'),
};

hlGroupManager.register(highlights);

export class FileSource extends ExplorerSource<FileItem> {
  name = 'file';
  hlSrcId = workspace.createNameSpace('coc-explorer-file');
  root!: string;
  showHiddenFiles: boolean = config.get<boolean>('file.showHiddenFiles')!;
  copyItems: Set<FileItem> = new Set();
  cutItems: Set<FileItem> = new Set();
  revealFileItem: FileItem | null = null;

  async init() {
    const { nvim } = this;

    await fileColumnManager.init(this);

    if (activeMode) {
      setTimeout(() => {
        if (workspace.env.isVim) {
          if (supportBufferHighlight()) {
            events.on(
              'BufEnter',
              debounce(200, async (bufnr) => {
                if (bufnr === this.explorer.bufnr) {
                  await this.reload(null);
                }
              }),
            );
          }
        } else {
          events.on(
            'BufEnter',
            debounce(200, async (bufnr) => {
              if (bufnr !== this.explorer.bufnr) {
                const bufinfo = await nvim.call('getbufinfo', [bufnr]);
                if (bufinfo[0] && bufinfo[0].name) {
                  const item = await this.findItemByPath(bufinfo[0].name as string);
                  if (item) {
                    this.revealFileItem = item;
                  }
                  await this.render();
                  if (autoReveal) {
                    await this.gotoItem(this.revealFileItem);
                  }
                }
              } else {
                this.revealFileItem = null;
                await this.render({ storeCursor: false });
              }
            }),
          );

          events.on(
            ['InsertLeave', 'TextChanged'],
            debounce(1000, async () => {
              diagnosticUI.reload();
              if (
                (fileColumnManager.columns.includes('diagnosticError') && diagnosticUI.errorNeedRedraw) ||
                (fileColumnManager.columns.includes('diagnosticWarning') && diagnosticUI.warningNeedRedraw)
              ) {
                await this.render();
              }
            }),
          );
        }
      }, 30);
    }

    this.root = pathLib.join(this.explorer.args.cwd);

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
      'goto parent root',
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
      'change directory',
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
                await this.nvim.command(`${winnr}wincmd w`);
                await nvim.command(`edit ${item.fullpath}`);
              },
              async () => {
                await this.doAction('openInVsplit', item);
              },
            );
          } else if (openStrategy === 'previousBuffer') {
            if (await this.gotoPrevWin()) {
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
          await nvim.command(`vsplit ${item.fullpath}`);
          const winnr = await nvim.call('winnr');
          if (this.explorer.position === 'left') {
            if (winnr === 1) {
              await nvim.command('wincmd L');
            }
          } else {
            const lastWinid = (await nvim.call('winnr', '$')) as number;
            if (winnr === lastWinid) {
              await nvim.command('wincmd H');
            }
          }
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
      { multi: false },
    );
    this.addItemAction(
      'expandRecursive',
      async (item) => {
        await this.expandRecursiveItems([item]);
        await this.render();
      },
      'expand directory recursively',
      { multi: true },
    );
    this.addItemAction(
      'shrink',
      async (item) => {
        if (item.directory && expandStore.isExpanded(item.fullpath)) {
          expandStore.shrink(item.fullpath);
          await this.render();
        } else if (item.parent) {
          expandStore.shrink(item.parent.fullpath);
          await this.render();
          await this.gotoItem(item.parent);
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
      { multi: false },
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
      { multi: false },
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
        const checkSameFilename = (items: Set<FileItem>) => {
          Promise.all(
            Array.from(items).map(async (item) => {
              const targetPath = pathLib.join(targetDir, item.name);
              await guardTargetPath(targetPath);
            }),
          ).catch(onError);
        };
        if (this.copyItems.size > 0) {
          await checkSameFilename(this.copyItems);
          await Promise.all(
            Array.from(this.copyItems).map(async (item) => {
              await copyFileOrDirectory(item.fullpath, pathLib.join(targetDir, item.name));
            }),
          );
          this.copyItems.clear();
          await this.reload(null);
        } else if (this.cutItems.size > 0) {
          await checkSameFilename(this.cutItems);
          await Promise.all(
            Array.from(this.cutItems).map(async (item) => {
              await fsRename(item.fullpath, pathLib.join(targetDir, item.name));
            }),
          );
          this.cutItems.clear();
          await this.reload(null);
        }
      },
      'paste files to here',
      { multi: false },
    );
    this.addItemsAction(
      'delete',
      async (items) => {
        const list = items.map((item) => item.fullpath).join('\n');
        // tslint:disable-next-line: ban
        workspace.showMessage(list);
        if (await workspace.showPrompt(`Move these files or directories to trash?`)) {
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
        // tslint:disable-next-line: ban
        workspace.showMessage(list);
        if (await workspace.showPrompt(`Forever delete these files or directories?`)) {
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
        const filename = (await nvim.call('input', 'Input new filename: ')) as string;
        if (filename.length === 0) {
          return;
        }
        const targetPath = pathLib.join(this.getPutTargetDir(items ? items[0] : null), filename);
        await guardTargetPath(targetPath);
        await fsMkdir(pathLib.dirname(targetPath), { recursive: true });
        await fsTouch(targetPath);
        await this.reload(null);
        const addedItem = await this.findItemByPath(targetPath);
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
        const directoryPath = (await nvim.call('input', 'Input new directory name: ')) as string;
        if (directoryPath.length === 0) {
          return;
        }
        await guardTargetPath(directoryPath);
        const targetPath = pathLib.join(this.getPutTargetDir(items ? items[0] : null), directoryPath);
        await fsMkdir(targetPath, { recursive: true });
        await this.reload(null);
        const addedItem = await this.findItemByPath(targetPath);
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
        const targetPath = (await nvim.call('input', ['New name: ', item.fullpath])) as string;
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
      { multi: false },
    );

    this.addItemsAction(
      'gitStage',
      async (items) => {
        await gitManager.stage(...items.map((item) => item.fullpath));
        await this.reload(null);
      },
      'add file to git index',
    );

    this.addItemsAction(
      'gitUnstage',
      async (items) => {
        await gitManager.unstage(...items.map((item) => item.fullpath));
        await this.reload(null);
      },
      'reset file from git index',
    );

    this.addItemAction(
      'gitPrev',
      async (item) => {
        const lineIndex = this.lines.findIndex(([, it]) => it === item);
        const changedIndex = gitChangedLineIndexs.findIndex((index) => index >= lineIndex);
        if (changedIndex !== -1) {
          const prevLineIndex = gitChangedLineIndexs[changedIndex - 1];
          if (prevLineIndex !== undefined) {
            await this.gotoLineIndex(prevLineIndex);
          }
        }
      },
      'goto previous git changed',
    );

    this.addItemAction(
      'gitNext',
      async (item) => {
        const lineIndex = this.lines.findIndex(([, it]) => it === item);
        const changedIndex = gitChangedLineIndexs.findIndex((index) => index > lineIndex) - 1;
        if (changedIndex !== -2) {
          const nextLineIndex = gitChangedLineIndexs[changedIndex + 1];
          if (nextLineIndex !== undefined) {
            await this.gotoLineIndex(nextLineIndex);
          }
        }
      },
      'goto previous git changed',
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

  async findItemByPath(path: string, items: FileItem[] = this.items): Promise<FileItem | null> {
    for (const item of items) {
      if (item.directory && path.startsWith(item.fullpath + '/')) {
        expandStore.expand(item.fullpath);
        if (!item.children) {
          item.children = await this.listFiles(item.fullpath, item);
        }
        return await this.findItemByPath(path, item.children);
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
          const stat = await fsStat(fullpath);
          const executable = await fsAccess(fullpath, fs.constants.X_OK);
          const writable = await fsAccess(fullpath, fs.constants.W_OK);
          const readable = await fsAccess(fullpath, fs.constants.R_OK);
          const item: FileItem = {
            uid: this.name + '-' + fullpath,
            name: file,
            level: parent ? parent.level + 1 : 1,
            fullpath,
            directory: stat.isDirectory(),
            readonly: !writable && readable,
            executable,
            readable,
            writable,
            hidden: file.startsWith('.'),
            isLastInLevel: false,
            stat,
            parent: parent || undefined,
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

    const sortedFiles = this.sortFiles(results.filter((r): r is FileItem => r !== null));
    if (sortedFiles.length > 0) {
      sortedFiles[sortedFiles.length - 1].isLastInLevel = true;
    }
    return sortedFiles;
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

  async loadItems(_item: FileItem | null): Promise<FileItem[]> {
    if (expandStore.isExpanded(this.root)) {
      return this.listFiles(this.root, null);
    } else {
      return [];
    }
  }

  async loaded(item: FileItem | null) {
    await fileColumnManager.load(item);
  }

  async opened() {
    if (this.explorer.revealFilepath && autoReveal) {
      const item = await this.findItemByPath(this.explorer.revealFilepath);
      await this.render({ storeCursor: false });
      await this.gotoItem(item, { col: 1 });
    } else {
      await this.gotoRoot({ col: 1 });
    }
  }

  draw(builder: SourceViewBuilder<FileItem>) {
    fileColumnManager.beforeDraw();

    const rootExpanded = expandStore.isExpanded(this.root);
    builder.newRoot((row) => {
      row.add(rootExpanded ? '-' : '+', highlights.expandIcon.group);
      row.add(' ');
      row.add(`[FILE${this.showHiddenFiles ? ' I' : ''}]:`, highlights.title.group);
      row.add(' ');
      row.add(`${this.root}`);
    });
    const drawSubDirectory = (items: FileItem[]) => {
      for (const item of items) {
        if (!item.hidden || this.showHiddenFiles) {
          builder.newItem(item, (row) => {
            fileColumnManager.drawItem(row, item);
          });
          if (expandStore.isExpanded(item.fullpath) && item.children) {
            drawSubDirectory(item.children);
          }
        }
      }
    };
    if (rootExpanded) {
      drawSubDirectory(this.items);
    }
  }
}

sourceManager.registerSource(new FileSource());
