import { workspace, Uri } from 'coc.nvim';
import fs from 'fs';
import pathLib from 'path';
import { onError } from '../../../logger';
import {
  getActiveMode,
  getAutoReveal,
  config,
  onBufEnter,
  fsAccess,
  fsReaddir,
  fsLstat,
  fsStat,
  normalizePath,
  getExtensions,
  Notifier,
  listDrive,
  isWindows,
  debounce,
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
import { argOptions } from '../../../arg-options';

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
    hiddenRules.patternMatches.some((pattern) =>
      new RegExp(pattern).test(filename),
    )
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
  directoryExpanded: hl('FileDirectoryExpanded', 'Directory'),
  directoryCollapsed: hl('FileDirectoryCollapsed', 'Directory'),
  linkTarget: hl('FileLinkTarget', 'Comment'),
  gitStage: hl('FileGitStage', 'Comment'),
  gitUnstage: hl('FileGitUnstage', 'Operator'),
  indentLine: hl('IndentLine', 'Comment'),
  clip: hl('FileClip', 'Statement'),
  size: hl('FileSize', 'Constant'),
  readonly: hl('FileReadonly', 'Operator'),
  modified: hl('FileModified', 'Operator'),
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
      if (workspace.isNvim) {
        if (getAutoReveal()) {
          this.subscriptions.push(
            onBufEnter(async (bufnr) => {
              if (bufnr === this.explorer.bufnr) {
                return;
              }
              const fullpath: string = await workspace.nvim.call('expand', [
                `#${bufnr}:p`,
              ]);
              if (!fullpath) {
                return;
              }
              const [
                revealNode,
                notifiers,
              ] = await this.revealNodeByPathNotifier(fullpath, {
                render: true,
                goto: true,
              });
              if (revealNode) {
                await Notifier.runAll(notifiers);
              }
            }, 200),
          );
        }

        this.subscriptions.push(
          this.bufManager.onModified(
            debounce(500, async (fullpath) => {
              await this.renderPaths([fullpath]);
            }),
          ),
        );
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
    this.root = await args.value(argOptions.rootUri);
  }

  async cd(fullpath: string) {
    const { nvim } = this;
    const escapePath = (await nvim.call('fnameescape', fullpath)) as string;
    if (config.get<boolean>('file.tabCD')) {
      if (workspace.isNvim || (await nvim.call('exists', [':tcd']))) {
        await nvim.command('tcd ' + escapePath);
        // tslint:disable-next-line: ban
        workspace.showMessage(`Tab's CWD is: ${fullpath}`);
      }
    } else {
      await nvim.command('cd ' + escapePath);
      // tslint:disable-next-line: ban
      workspace.showMessage(`CWD is: ${fullpath}`);
    }
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

  async openedNotifier(isFirst: boolean) {
    const args = this.explorer.args;
    const revealPath = await this.revealPath();
    if (!revealPath) {
      if (isFirst) {
        return this.gotoRootNotifier({ col: 1 });
      }
      return;
    }

    const hasRevealPath = args.has(argOptions.reveal);

    if (getAutoReveal() || hasRevealPath) {
      const [revealNode, notifiers] = await this.revealNodeByPathNotifier(
        revealPath,
        {
          render: true,
          goto: true,
        },
      );
      if (revealNode !== null) {
        return Notifier.combine(notifiers);
      } else if (isFirst) {
        return Notifier.combine([
          ...notifiers,
          await this.gotoRootNotifier({ col: 1 }),
        ]);
      }
    } else if (isFirst) {
      return this.gotoRootNotifier({ col: 1 });
    }
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
      await task.waitShow();
      const [, notifiers] = await this.revealNodeByPathNotifier(
        Uri.parse(loc.uri).fsPath,
        {
          render: true,
          goto: true,
        },
      );
      await Notifier.runAll(notifiers);
    };

    const task = await this.startCocList(filesList);
    await task.waitShow();
  }

  async revealNodeByPathNotifier(
    path: string,
    {
      node = this.rootNode,
      goto = false,
      render = false,
      notifiers = [] as Notifier[],
    } = {},
  ): Promise<[FileNode | null, Notifier[]]> {
    path = normalizePath(path);
    if (path === node.fullpath) {
      return [node, notifiers];
    } else if (node.directory && path.startsWith(node.fullpath + pathLib.sep)) {
      let foundNode: FileNode | null = null;
      const isRender = render && !this.expandStore.isExpanded(node);
      if (!node.children) {
        node.children = await this.loadChildren(node);
      }
      for (const child of node.children) {
        const [childFoundNode] = await this.revealNodeByPathNotifier(path, {
          node: child,
          render: isRender ? false : render,
          notifiers,
          goto: false,
        });
        foundNode = childFoundNode;
        if (foundNode) {
          this.expandStore.expand(node);
          break;
        }
      }
      if (foundNode) {
        if (isRender) {
          const renderNotifier = await this.renderNotifier({
            node,
          });
          if (renderNotifier) {
            notifiers.push(renderNotifier);
          }
        }
        if (goto) {
          notifiers.push(await this.gotoNodeNotifier(foundNode));
        }
      }
      return [foundNode, notifiers];
    }
    return [null, notifiers];
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

  async loadChildren(parentNode: FileNode): Promise<FileNode[]> {
    let filenames: string[];
    if (isWindows && parentNode.fullpath === '') {
      filenames = await listDrive();
    } else {
      filenames = await fsReaddir(parentNode.fullpath);
    }
    const files = await Promise.all(
      filenames.map(async (filename) => {
        try {
          const hidden = isHidden(filename);
          if (!this.showHidden && hidden) {
            return null;
          }
          const fullpath = normalizePath(
            pathLib.join(parentNode.fullpath, filename),
          );
          const stat = await fsStat(fullpath).catch(() => {});
          const lstat = await fsLstat(fullpath).catch(() => {});
          const executable = await fsAccess(fullpath, fs.constants.X_OK);
          const writable = await fsAccess(fullpath, fs.constants.W_OK);
          const readable = await fsAccess(fullpath, fs.constants.R_OK);
          const directory =
            isWindows && /^[A-Za-z]:[\\\/]$/.test(fullpath)
              ? true
              : stat
              ? stat.isDirectory()
              : false;
          const child: FileNode = {
            type: 'child',
            uri: this.helper.generateUri(fullpath),
            level: parentNode ? parentNode.level + 1 : 1,
            drawnLine: '',
            parent: parentNode || this.rootNode,
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

  async loaded(parentNode: FileNode) {
    this.copiedNodes.clear();
    this.cutNodes.clear();
    await super.loaded(parentNode);
  }

  async renderPaths(paths: Set<string> | string[]) {
    return (await this.renderPathsNotifier(paths))?.run();
  }

  async renderPathsNotifier(paths: Set<string> | string[]) {
    const nodes = Array.from(paths)
      .map((path) => {
        return this.flattenedNodes.find((node) => node.fullpath === path);
      })
      .filter((node): node is FileNode => !!node);
    return this.renderNodesNotifier(nodes);
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
