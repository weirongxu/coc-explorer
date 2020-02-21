import { workspace, Uri } from 'coc.nvim';
import fs from 'fs';
import pathLib from 'path';
import { onError } from '../../../logger';
import {
  getActiveMode,
  getAutoReveal,
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
import { ExplorerSource, BaseTreeNode } from '../../source';
import { sourceManager } from '../../source-manager';
import { fileColumnRegistrar } from './file-column-registrar';
import './load';
import { filesList } from '../../../lists/files';
import { initFileActions } from './file-actions';
import { homedir } from 'os';
import { labelHighlight, TemplateRenderer } from '../../template-renderer';
import { argOptions } from '../../../parse-args';

const getHiddenRules = () =>
  config.get<{
    extensions: string[];
    filenames: string[];
    patternMatches: string[];
  }>('file.hiddenRules')!;

function isHidden(filename: string) {
  const hiddenRules = getHiddenRules();

  const { basename, extensions } = getExtensions(filename);
  const extname = extensions[extensions.length - 1];

  return (
    hiddenRules.filenames.includes(basename) ||
    hiddenRules.extensions.includes(extname) ||
    hiddenRules.patternMatches.some((pattern) => new RegExp(pattern).test(filename))
  );
}

export interface FileNode extends BaseTreeNode<FileNode, 'root' | 'child'> {
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
}

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
export const fileHighlights = {
  title: hl('FileRoot', 'Constant'),
  rootName: hl('FileRootName', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Direcoty'),
  fullpath: hl('FileFullpath', 'Comment'),
  filename: hl('FileFilename', 'Ignore'),
  directory: hl('FileDirectory', 'Directory'),
  linkTarget: hl('FileLinkTarget', 'Comment'),
  gitStage: hl('FileGitStage', 'Comment'),
  gitUnstage: hl('FileGitUnstage', 'Operator'),
  indentLine: hl('IndentLine', 'Comment'),
  clip: hl('FileClip', 'Statement'),
  size: hl('FileSize', 'Constant'),
  readonly: hl('FileReadonly', 'Operator'),
  timeAccessed: hl('TimeAccessed', 'Identifier'),
  timeModified: hl('TimeModified', 'Identifier'),
  timeCreated: hl('TimeCreated', 'Identifier'),
  diagnosticError: hl('FileDiagnosticError', 'CocErrorSign'),
  diagnosticWarning: hl('FileDiagnosticWarning', 'CocWarningSign'),
};

export class FileSource extends ExplorerSource<FileNode> {
  scheme = 'file';
  hlSrcId = workspace.createNameSpace('coc-explorer-file');
  showHidden: boolean = config.get<boolean>('file.showHiddenFiles')!;
  copiedNodes: Set<FileNode> = new Set();
  cutNodes: Set<FileNode> = new Set();
  rootNode: FileNode = {
    type: 'root',
    isRoot: true,
    uri: this.helper.generateUri('/'),
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
  };
  templateRenderer: TemplateRenderer<FileNode> = new TemplateRenderer<FileNode>(
    this,
    fileColumnRegistrar,
  );

  get root() {
    return this.rootNode.fullpath;
  }

  set root(root: string) {
    this.rootNode.fullpath = root;
    this.rootNode.children = undefined;
  }

  async init() {
    const { nvim } = this;

    if (getActiveMode()) {
      if (!workspace.env.isVim) {
        if (getAutoReveal()) {
          this.subscriptions.push(
            onBufEnter(async (bufnr) => {
              if (bufnr === this.explorer.bufnr) {
                return;
              }
              const bufinfo = await nvim.call('getbufinfo', [bufnr]);
              if (!bufinfo[0] || !bufinfo[0].name) {
                return;
              }
              await execNotifyBlock(async () => {
                const node = await this.revealNodeByPath(bufinfo[0].name, {
                  render: true,
                  notify: true,
                });
                if (node) {
                  await this.gotoNode(node, { notify: true });
                }
              });
            }, 200),
          );
        }
      } else {
        this.subscriptions.push(
          onBufEnter(async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.reload(this.rootNode);
            }
          }, 200),
        );
      }
    }

    initFileActions(this);
  }

  async open() {
    await this.templateRenderer.parse(
      'root',
      await this.explorer.args.value(argOptions.fileRootTemplate),
      await this.explorer.args.value(argOptions.fileRootLabelingTemplate),
    );

    await this.templateRenderer.parse(
      'child',
      await this.explorer.args.value(argOptions.fileChildTemplate),
      await this.explorer.args.value(argOptions.fileChildLabelingTemplate),
    );

    const args = this.explorer.args;
    this.root = await args.rootPath();
  }

  async revealPath() {
    const revealPath = await this.explorer.args.value(argOptions.reveal);
    if (revealPath) {
      return revealPath;
    } else {
      const bufnr = await this.explorer.sourceBufnrBySourceWinid();
      if (bufnr) {
        return (await this.nvim.call('expand', `#${bufnr}:p`)) as string;
      }
      return null;
    }
  }

  async opened(isFirst: boolean, isNotify: boolean) {
    await execNotifyBlock(async () => {
      const args = this.explorer.args;
      const revealPath = await this.revealPath();
      if (!revealPath) {
        if (isFirst) {
          await this.gotoRoot({ col: 1, notify: true });
        }
        return;
      }
      const hasRevealPath = args.has(argOptions.reveal);
      if (getAutoReveal() || hasRevealPath) {
        const revealNode = await this.revealNodeByPath(revealPath, { render: true, notify: true });
        if (revealNode !== null) {
          await this.gotoNode(revealNode, { col: 1, notify: true });
        } else if (isFirst) {
          await this.gotoRoot({ col: 1, notify: true });
        }
      } else if (isFirst) {
        await this.gotoRoot({ col: 1, notify: true });
      }
    }, isNotify);
  }

  getPutTargetNode(node: FileNode) {
    if (node.isRoot) {
      return this.rootNode;
    } else if (node.expandable && this.expandStore.isExpanded(node)) {
      return node;
    } else if (node.parent) {
      return node.parent;
    } else {
      return this.rootNode;
    }
  }

  getPutTargetDir(node: FileNode) {
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
          await task.resolve();
          await this.gotoNode(node, { notify: true });
        }
      });
    };

    const task = await this.startCocList(filesList);
    await task.done();
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
          const fullpath = normalizePath(pathLib.join(parent.fullpath, filename));
          const stat = await fsStat(fullpath).catch(() => {});
          const lstat = await fsLstat(fullpath).catch(() => {});
          const executable = await fsAccess(fullpath, fs.constants.X_OK);
          const writable = await fsAccess(fullpath, fs.constants.W_OK);
          const readable = await fsAccess(fullpath, fs.constants.R_OK);
          const directory = stat ? stat.isDirectory() : false;
          const child: FileNode = {
            type: 'child',
            uri: this.helper.generateUri(fullpath),
            level: parent ? parent.level + 1 : 1,
            drawnLine: '',
            parent: parent || this.rootNode,
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

  async drawRootLabeling(node: FileNode) {
    const lines: string[] = [];
    const row = await this.viewBuilder.drawRow(async (row) => {
      row.add('Fullpath:', { hl: labelHighlight });
      row.add(' ');
      row.add(node.fullpath, { hl: fileHighlights.directory });
    });
    const { highlightPositions, content } = await row.draw();
    lines.push(content);
    return {
      highlightPositions: highlightPositions.map((hl) => ({
        line: 0,
        ...hl,
      })),
      lines,
    };
  }

  async drawNode(node: FileNode, nodeIndex: number) {
    await this.viewBuilder.drawRowForNode(node, async (row) => {
      await this.templateRenderer.draw(row, node, nodeIndex);
    });
  }
}

sourceManager.registerSource('file', FileSource);
