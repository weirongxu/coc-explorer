import { workspace, Uri } from 'coc.nvim';
import fs from 'fs';
import pathLib from 'path';
import { onError } from '../../../logger';
import {
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
  generateUri,
} from '../../../util';
import { hlGroupManager } from '../../highlightManager';
import { ExplorerSource, BaseTreeNode } from '../../source';
import { sourceManager } from '../../sourceManager';
import { fileColumnRegistrar } from './fileColumnRegistrar';
import './load';
import { fileList } from '../../../lists/files';
import { initFileActions } from './fileActions';
import { homedir } from 'os';
import { SourcePainters } from '../../sourcePainters';
import { argOptions } from '../../../argOptions';
import { onBufEnter } from '../../../events';

export interface FileNode extends BaseTreeNode<FileNode, 'root' | 'child'> {
  name: string;
  fullpath: string;
  uri: string;
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
  showHidden: boolean = this.config.get<boolean>('file.showHiddenFiles')!;
  copiedNodes: Set<FileNode> = new Set();
  cutNodes: Set<FileNode> = new Set();
  rootNode: FileNode = {
    type: 'root',
    isRoot: true,
    uid: this.helper.getUid('/'),
    uri: generateUri('/'),
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
  sourcePainters: SourcePainters<FileNode> = new SourcePainters<FileNode>(
    this,
    fileColumnRegistrar,
  );

  get root() {
    return this.rootNode.fullpath;
  }

  set root(root: string) {
    this.rootNode.uri = generateUri(root);
    this.rootNode.uid = this.helper.getUid(root);
    this.rootNode.fullpath = root;
    this.rootNode.children = undefined;
  }

  getHiddenRules() {
    return this.config.get<{
      extensions: string[];
      filenames: string[];
      patternMatches: string[];
    }>('file.hiddenRules')!;
  }

  isHidden(filename: string) {
    const hiddenRules = this.getHiddenRules();

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

  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return this.config.get('file.column.' + name, defaultValue)!;
  }

  async init() {
    const { nvim } = this;

    if (this.config.activeMode) {
      if (workspace.isNvim) {
        if (this.config.autoReveal) {
          this.subscriptions.push(
            onBufEnter(async (bufnr) => {
              if (bufnr === this.explorer.bufnr) {
                return;
              }
              const position = await this.explorer.args.value(
                argOptions.position,
              );
              if (position === 'floating') {
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
              ] = await this.revealNodeByPathNotifier(fullpath);
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
    await this.sourcePainters.parseTemplate(
      'root',
      await this.explorer.args.value(argOptions.fileRootTemplate),
      await this.explorer.args.value(argOptions.fileRootLabelingTemplate),
    );

    await this.sourcePainters.parseTemplate(
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
    if (this.config.get<boolean>('file.tabCD')) {
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

    if (this.config.autoReveal || hasRevealPath) {
      const [revealNode, notifiers] = await this.revealNodeByPathNotifier(
        revealPath,
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
    } else if (node.expandable && this.isExpanded(node)) {
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
    fileList.showHidden = this.showHidden;
    fileList.rootPath = path;
    fileList.recursive = recursive;
    fileList.revealCallback = async (loc) => {
      await task.waitShow();
      const [, notifiers] = await this.revealNodeByPathNotifier(
        Uri.parse(loc.uri).fsPath,
      );
      await Notifier.runAll(notifiers);
    };

    const task = await this.startCocList(fileList);
    await task.waitShow();
  }

  async revealNodeByPathNotifier(
    path: string,
    { node = this.rootNode, goto = true, render = true, compact = false } = {},
  ): Promise<[FileNode | null, Notifier[]]> {
    path = normalizePath(path);
    const notifiers: Notifier[] = [];

    const revealRecursive = async (
      path: string,
      {
        node,
        goto,
        render,
      }: { node: FileNode; goto: boolean; render: boolean },
    ): Promise<FileNode | null> => {
      if (path === node.fullpath) {
        return node;
      } else if (
        node.directory &&
        path.startsWith(node.fullpath + pathLib.sep)
      ) {
        let foundNode: FileNode | null = null;
        const isRender = render && !this.isExpanded(node);
        if (!node.children) {
          node.children = await this.load(node);
        }
        for (const child of node.children) {
          const childFoundNode = await revealRecursive(path, {
            node: child,
            goto: false,
            render: isRender ? false : render,
          });
          foundNode = childFoundNode;
          if (foundNode) {
            await this.expandNode(node, { compact, render: false });
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
        return foundNode;
      }
      return null;
    };

    const foundNode = await revealRecursive(path, { node, goto, render });
    return [foundNode, notifiers];
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
          const hidden = this.isHidden(filename);
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
            uid: this.helper.getUid(fullpath),
            uri: generateUri(fullpath),
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
}

sourceManager.registerSource('file', FileSource);
