import { workspace, listManager, Uri } from 'coc.nvim';
import fs from 'fs';
import pathLib from 'path';
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
  normalizePath,
  getExtensions,
} from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, sourceIcons, DrawNodeOption } from '../../source';
import { sourceManager } from '../../source-manager';
import { fileColumnRegistrar } from './file-column-registrar';
import './load';
import { filesList } from '../../../lists/files';
import { initFileActions } from './file-actions';
import { homedir } from 'os';

const hiddenRules = config.get<{
  extensions: string[];
  filenames: string[];
  patternMatches: string[];
}>('file.hiddenRules')!;
function isHidden(filename: string) {
  const { basename, extensions } = getExtensions(filename);
  const extname = extensions[extensions.length - 1];

  return (
    hiddenRules.filenames.includes(basename) ||
    hiddenRules.extensions.includes(extname) ||
    hiddenRules.patternMatches.some((pattern) => new RegExp(pattern).test(filename))
  );
}

export type FileNode = {
  uid: string;
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
};

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const highlights = {
  title: hl('FileRoot', 'Constant'),
  name: hl('FileRootName', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Direcoty'),
  fullpath: hl('FileFullpath', 'Comment'),
};

export class FileSource extends ExplorerSource<FileNode> {
  hlRevealedLineSrcId = workspace.createNameSpace('coc-explorer-file-revealed-line');
  showHidden: boolean = config.get<boolean>('file.showHiddenFiles')!;
  copiedNodes: Set<FileNode> = new Set();
  cutNodes: Set<FileNode> = new Set();
  rootNode: FileNode = {
    uid: this.sourceName + '://',
    level: 0,
    drawnLine: '',
    name: 'root',
    fullpath: homedir(),
    expandable: true,
    directory: true,
    readonly: true,
    executable: false,
    readable: true,
    writable: true,
    hidden: false,
    symbolicLink: true,
    lstat: null,
    isFirstInLevel: true,
    isLastInLevel: true,
  };

  get root() {
    return this.rootNode.fullpath;
  }

  set root(root: string) {
    this.rootNode.fullpath = root;
    this.rootNode.children = undefined;
  }

  async init() {
    const { nvim } = this;

    await this.columnManager.registerColumns(this.explorer.args.fileColumns, fileColumnRegistrar);

    if (activeMode) {
      if (!workspace.env.isVim) {
        if (autoReveal) {
          this.subscriptions.push(
            onBufEnter(200, async (bufnr) => {
              if (bufnr !== this.explorer.bufnr) {
                const bufinfo = await nvim.call('getbufinfo', [bufnr]);
                if (bufinfo[0] && bufinfo[0].name) {
                  await execNotifyBlock(async () => {
                    const node = await this.revealNodeByPath(bufinfo[0].name, {
                      render: true,
                      notify: true,
                    });
                    if (node) {
                      await this.gotoNode(node, { notify: true });
                    }
                  });
                }
              }
            }),
          );
        }
      } else {
        this.subscriptions.push(
          onBufEnter(200, async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.reload(this.rootNode);
            }
          }),
        );
      }
    }

    initFileActions(this);
  }

  getPutTargetNode(node: FileNode | null) {
    if (node === null) {
      return this.rootNode;
    } else if (node.expandable && this.expandStore.isExpanded(node)) {
      return node;
    } else if (node.parent) {
      return node.parent;
    } else {
      return this.rootNode;
    }
  }

  getPutTargetDir(node: FileNode | null) {
    return this.getPutTargetNode(node).fullpath;
  }

  async searchByCocList(path: string, recursive: boolean) {
    filesList.showHidden = this.showHidden;
    filesList.rootPath = path;
    filesList.recursive = recursive;
    filesList.revealCallback = async (loc) => {
      await execNotifyBlock(async () => {
        const node = await this.revealNodeByPath(Uri.parse(loc.uri).fsPath, {
          render: true,
          notify: true,
        });
        if (node) {
          await this.gotoNode(node, { notify: true });
        }
      });
    };
    const disposable = listManager.registerList(filesList);
    await listManager.start([filesList.name]);
    disposable.dispose();
  }

  async revealNodeByPath(
    path: string,
    { node = this.rootNode, render = false, notify = false } = {},
  ): Promise<FileNode | null> {
    path = normalizePath(path);
    if (node.directory && path.startsWith(node.fullpath + pathLib.sep)) {
      let result: FileNode | null = null;
      const isExpanded = this.expandStore.isExpanded(node);
      const requestRender = !isExpanded;
      if (!node.children) {
        node.children = await this.loadChildren(node);
      }
      for (const child of node.children) {
        result = await this.revealNodeByPath(path, {
          node: child,
          render: requestRender ? false : render,
          notify,
        });
        if (result) {
          this.expandStore.expand(node);
          break;
        }
      }
      if (result && render && requestRender) {
        await this.render({ node, notify, storeCursor: false });
      }
      return result;
    } else if (path === node.fullpath) {
      return node;
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

  async loadChildren(parent: FileNode): Promise<FileNode[]> {
    const filenames = await fsReaddir(parent.fullpath);
    const files = await Promise.all(
      filenames.map(async (filename) => {
        try {
          const hidden = isHidden(filename);
          if (!this.showHidden && hidden) {
            return null;
          }
          const fullpath = pathLib.join(parent.fullpath, filename);
          const stat = await fsStat(fullpath).catch(() => {});
          const lstat = await fsLstat(fullpath).catch(() => {});
          const executable = await fsAccess(fullpath, fs.constants.X_OK);
          const writable = await fsAccess(fullpath, fs.constants.W_OK);
          const readable = await fsAccess(fullpath, fs.constants.R_OK);
          const directory = stat ? stat.isDirectory() : false;
          const child: FileNode = {
            uid: this.sourceName + '://' + fullpath,
            level: parent ? parent.level + 1 : 1,
            drawnLine: '',
            parent: parent || undefined,
            expandable: directory,
            name: filename,
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
          };
          if (this.expandStore.isExpanded(child)) {
            child.children = await this.loadChildren(child);
          }
          return child;
        } catch (error) {
          onError(error);
          return null;
        }
      }),
    );

    return this.sortFiles(files.filter((r): r is FileNode => r !== null));
  }

  async loaded(sourceNode: FileNode) {
    this.copiedNodes.clear();
    this.cutNodes.clear();
    await super.loaded(sourceNode);
  }

  async renderPaths(paths: Set<string> | string[]) {
    const nodes = Array.from(paths)
      .map((path) => {
        return this.flattenedNodes.find((node) => node.fullpath === path);
      })
      .filter((node): node is FileNode => !!node);
    return await this.renderNodes(nodes);
  }

  async drawNode(node: FileNode, nodeIndex: number, options: DrawNodeOption<FileNode>) {
    if (!node.parent) {
      node.drawnLine = await this.viewBuilder.drawLine(async (row) => {
        row.add(
          this.expanded ? sourceIcons.expanded : sourceIcons.collapsed,
          highlights.expandIcon,
        );
        row.add(' ');
        row.add(`[FILE${this.showHidden ? ' ' + sourceIcons.hidden : ''}]:`, highlights.title);
        row.add(' ');
        row.add(pathLib.basename(this.root), highlights.name);
        row.add(' ');
        row.add(this.root, highlights.fullpath);
      });
    } else {
      node.isFirstInLevel = options.prevSiblingNode === undefined;
      node.isLastInLevel = options.nextSiblingNode === undefined;

      node.drawnLine = await this.viewBuilder.drawLine(async (row) => {
        await this.columnManager.draw(row, node, nodeIndex);
      });
    }
  }
}

sourceManager.registerSource('file', FileSource);
