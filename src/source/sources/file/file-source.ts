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
import { fileColumnManager } from './column-manager';
import './load';
import { filesList } from '../../../lists/files';
import { URI } from 'vscode-uri';
import { initFileActions } from './file-actions';
import { homedir } from 'os';
import { GitIndexes } from '../../../indexes/git-indexes';

export type FileNode = {
  uid: string | null;
  level: number;
  drawnLine: string;
  parent?: FileNode;
  children?: FileNode[];
  expandable: boolean;
  name: string;
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
  data: Record<string, any>;
};

const hl = hlGroupManager.hlLinkGroupCommand.bind(hlGroupManager);
const highlights = {
  title: hl('FileRoot', 'Constant'),
  name: hl('FileRootName', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Direcoty'),
  fullpath: hl('FileFullpath', 'Comment'),
};

export class FileSource extends ExplorerSource<FileNode> {
  name = 'file';
  hlSrcId = workspace.createNameSpace('coc-explorer-file');
  hlRevealedLineSrcId = workspace.createNameSpace('coc-explorer-file-revealed-line');
  showHidden: boolean = config.get<boolean>('file.showHiddenFiles')!;
  copiedNodes: Set<FileNode> = new Set();
  cutNodes: Set<FileNode> = new Set();
  diagnosisLineIndexes: number[] = [];
  gitChangedLineIndexes: number[] = [];
  rootNode = {
    uid: null,
    level: 0,
    drawnLine: '',
    isRoot: true,
    name: 'root',
    fullpath: homedir(),
    expandable: true,
    directory: true,
    children: [] as FileNode[],
    readonly: true,
    executable: false,
    readable: true,
    writable: true,
    hidden: false,
    symbolicLink: true,
    lstat: null,
    isFirstInLevel: true,
    isLastInLevel: true,
    data: {},
  };

  get root() {
    return this.rootNode.fullpath;
  }

  set root(root: string) {
    this.rootNode.fullpath = root;
    // this.rootNode.uid = root;
  }

  async init() {
    const { nvim } = this;

    await fileColumnManager.init(this);

    if (fileColumnManager.columns.includes('git')) {
      this.explorer.indexesManager.addIndexes('git', new GitIndexes());
    }

    if (activeMode) {
      this.explorer.emitterDidInit.event(() => {
        if (!workspace.env.isVim) {
          if (autoReveal) {
            onBufEnter(200, async (bufnr) => {
              if (bufnr !== this.explorer.bufnr) {
                const bufinfo = await nvim.call('getbufinfo', [bufnr]);
                if (bufinfo[0] && bufinfo[0].name) {
                  const node = await this.revealNodeByPath(bufinfo[0].name, this.rootNode.children);
                  if (node !== null) {
                    await execNotifyBlock(async () => {
                      await this.render({ storeCursor: false, notify: true });
                      await this.gotoNode(node, { notify: true });
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
              await this.reload(this.rootNode);
            }
          });
        }
      });
    }

    initFileActions(this);
  }

  getPutTargetDir(node: FileNode | null) {
    return node === null
      ? this.root
      : node.directory && this.expandStore.isExpanded(node)
      ? node.fullpath
      : node.parent
      ? node.parent.fullpath
      : this.root;
  }

  async searchByCocList(path: string, recursive: boolean) {
    filesList.ignore = !this.showHidden;
    filesList.rootPath = path;
    filesList.recursive = recursive;
    filesList.revealCallback = async (loc) => {
      const node = await this.revealNodeByPath(URI.parse(loc.uri).fsPath, this.rootNode.children);
      if (node !== null) {
        await execNotifyBlock(async () => {
          await this.render({ storeCursor: false, notify: true });
          await this.gotoNode(node, { notify: true });
        });
      }
    };
    const disposable = listManager.registerList(filesList);
    await listManager.start([filesList.name]);
    disposable.dispose();
  }

  async revealNodeByPath(path: string, nodes: FileNode[]): Promise<FileNode | null> {
    path = normalizePath(path);
    for (const node of nodes) {
      if (node.directory && path.startsWith(node.fullpath + pathLib.sep)) {
        this.expandStore.expand(node);
        if (!node.children) {
          node.children = await this.listFiles(node.fullpath, node);
        }
        return await this.revealNodeByPath(path, node.children);
      } else if (path === node.fullpath) {
        return node;
      }
    }
    return null;
  }

  sortFiles(files: FileNode[]) {
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

  async listFiles(path: string, parent: FileNode | null | undefined) {
    const filepaths = await fsReaddir(path);
    const files = await Promise.all(
      filepaths.map(async (filepath) => {
        try {
          const hidden = filepath.startsWith('.');
          if (!this.showHidden && hidden) {
            return null;
          }
          const fullpath = pathLib.join(path, filepath);
          const stat = await fsStat(fullpath).catch(() => {});
          const lstat = await fsLstat(fullpath).catch(() => {});
          const executable = await fsAccess(fullpath, fs.constants.X_OK);
          const writable = await fsAccess(fullpath, fs.constants.W_OK);
          const readable = await fsAccess(fullpath, fs.constants.R_OK);
          const directory = stat ? stat.isDirectory() : false;
          const node: FileNode = {
            uid: fullpath,
            level: parent ? parent.level + 1 : 1,
            drawnLine: '',
            parent: parent || undefined,
            expandable: directory,
            name: filepath,
            fullpath,
            directory: directory,
            readonly: !writable && readable,
            executable,
            readable,
            writable,
            hidden,
            symbolicLink: lstat ? lstat.isSymbolicLink() : false,
            isFirstInLevel: false,
            isLastInLevel: false,
            lstat: lstat || null,
            data: {},
          };
          if (this.expandStore.isExpanded(node)) {
            node.children = await this.listFiles(node.fullpath, node);
          }
          return node;
        } catch (error) {
          onError(error);
          return null;
        }
      }),
    );

    return this.sortFiles(files.filter((r): r is FileNode => r !== null));
  }

  async shrinkRecursiveNodes(nodes: FileNode[]) {
    await Promise.all(
      nodes.map(async (node) => {
        if (node.directory) {
          this.expandStore.shrink(node);
          if (node.children) {
            await this.shrinkRecursiveNodes(node.children);
          }
        }
      }),
    );
  }

  async loadChildren(node: FileNode): Promise<FileNode[]> {
    if (this.expandStore.isExpanded(node)) {
      return this.listFiles(node.fullpath, node);
    } else {
      return [];
    }
  }

  async loaded(sourceNode: FileNode) {
    this.copiedNodes.clear();
    this.cutNodes.clear();
    await fileColumnManager.load(sourceNode);
  }

  async beforeDraw(nodes: FileNode[]) {
    return await fileColumnManager.beforeDraw(nodes);
  }

  drawNode(node: FileNode, prevNode: FileNode, nextNode: FileNode) {
    if (!node.parent) {
      node.drawnLine = this.viewBuilder.drawLine((row) => {
        row.add(this.expanded ? sourceIcons.expanded : sourceIcons.shrinked, highlights.expandIcon);
        row.add(' ');
        row.add(`[FILE${this.showHidden ? ' I' : ''}]:`, highlights.title);
        row.add(' ');
        row.add(pathLib.basename(this.root), highlights.name);
        row.add(' ');
        row.add(this.root, highlights.fullpath);
      });
    } else {
      const prevNodeLevel = prevNode ? prevNode.level : 0;
      const nextNodeLevel = nextNode ? nextNode.level : 0;
      node.isFirstInLevel = prevNodeLevel < node.level;
      node.isLastInLevel = nextNodeLevel < node.level;

      node.drawnLine = this.viewBuilder.newNode(node, (row) => {
        fileColumnManager.drawNode(row, node);
      });
    }
  }
}

sourceManager.registerSource(new FileSource());
