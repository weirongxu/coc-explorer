import { events, workspace, listManager } from 'coc.nvim';
import fs from 'fs';
import pathLib from 'path';
import { diagnosticManager } from '../../../diagnostic-manager';
import { gitManager } from '../../../git-manager';
import { onError } from '../../../logger';
import {
  activeMode,
  autoReveal,
  config,
  execNotifyBlock,
  onBufEnter,
  fsAccess,
  fsReaddir,
  fsLstat,
  fsStat,
  debounce,
  normalizePath,
} from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, sourceIcons } from '../../source';
import { sourceManager } from '../../source-manager';
import { SourceViewBuilder } from '../../view-builder';
import { fileColumnManager } from './column-manager';
import './load';
import { filesList } from '../../../lists/files';
import { URI } from 'vscode-uri';
import { initFileActions } from './file-actions';

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
  title: hl('FileRoot', 'Constant'),
  name: hl('FileRootName', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Direcoty'),
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

    this.root = pathLib.join(this.explorer.rootPath);

    if (this.expanded) {
      expandStore.expand(this.root);
    }

    initFileActions(this);
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
      row.add(pathLib.basename(this.root), highlights.name);
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
