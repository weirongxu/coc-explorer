import { Uri, workspace } from 'coc.nvim';
import fs from 'fs';
import { homedir } from 'os';
import pathLib from 'path';
import { argOptions } from '../../../argOptions';
import { diagnosticHighlights } from '../../../diagnostic/highlights';
import { onBufEnter } from '../../../events';
import { gitHighlights } from '../../../git/highlights';
import { gitManager } from '../../../git/manager';
import { fileList } from '../../../lists/files';
import {
  fsAccess,
  fsLstat,
  fsReaddir,
  fsStat,
  getExtensions,
  isWindows,
  listDrive,
  normalizePath,
  onError,
} from '../../../util';
import { hlGroupManager } from '../../../highlight/manager';
import { BaseTreeNode, ExplorerSource } from '../../source';
import { sourceManager } from '../../sourceManager';
import { SourcePainters } from '../../sourcePainters';
import { fileArgOptions } from './argOptions';
import { loadFileActions } from './fileActions';
import { fileColumnRegistrar } from './fileColumnRegistrar';
import './load';
import { Notifier } from 'coc-helper';
import { ViewSource } from '../../../view/viewSource';

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
  lstat?: fs.Stats;
}

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
export const fileHighlights = {
  title: hl('FileRoot', 'Constant'),
  hidden: hl('FileHidden', 'Comment'),
  rootName: hl('FileRootName', 'Identifier'),
  expandIcon: hl('FileExpandIcon', 'Directory'),
  fullpath: hl('FileFullpath', 'Comment'),
  filename: hl('FileFilename', 'None'),
  directory: hl('FileDirectory', 'Directory'),
  directoryExpanded: hl('FileDirectoryExpanded', 'Directory'),
  directoryCollapsed: hl('FileDirectoryCollapsed', 'Directory'),
  linkTarget: hl('FileLinkTarget', 'Comment'),
  gitStaged: hl('FileGitStaged', gitHighlights.gitStaged.group),
  gitUnstaged: hl('FileGitUnstaged', gitHighlights.gitUnstaged.group),
  gitRootStaged: hl('FileGitRootStaged', 'Comment'),
  gitRootUnstaged: hl('FileGitRootUnstaged', 'Operator'),
  indentLine: hl('IndentLine', 'Comment'),
  clip: hl('FileClip', 'Statement'),
  size: hl('FileSize', 'Constant'),
  readonly: hl('FileReadonly', 'Operator'),
  modified: hl('FileModified', 'Operator'),
  timeAccessed: hl('TimeAccessed', 'Identifier'),
  timeModified: hl('TimeModified', 'Identifier'),
  timeCreated: hl('TimeCreated', 'Identifier'),
  diagnosticError: hl(
    'FileDiagnosticError',
    diagnosticHighlights.diagnosticError.group,
  ),
  diagnosticWarning: hl(
    'FileDiagnosticWarning',
    diagnosticHighlights.diagnosticWarning.group,
  ),
  filenameDiagnosticError: hl('FileFilenameDiagnosticError', 'CocErrorSign'),
  filenameDiagnosticWarning: hl(
    'FileFilenameDiagnosticWarning',
    'CocWarningSign',
  ),
};

export class FileSource extends ExplorerSource<FileNode> {
  scheme = 'file';
  showHidden: boolean = this.config.get<boolean>('file.showHiddenFiles')!;
  showOnlyGitChange: boolean = false;
  copiedNodes: Set<FileNode> = new Set();
  cutNodes: Set<FileNode> = new Set();
  view: ViewSource<FileNode> = new ViewSource<FileNode>(this, {
    type: 'root',
    isRoot: true,
    uid: this.helper.getUid(pathLib.sep),
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
    lstat: undefined,
  });
  sourcePainters: SourcePainters<FileNode> = new SourcePainters<FileNode>(
    this,
    fileColumnRegistrar,
  );

  get root() {
    return this.view.rootNode.fullpath;
  }

  set root(root: string) {
    this.view.rootNode.uid = this.helper.getUid(root);
    this.view.rootNode.fullpath = root;
    this.view.rootNode.children = undefined;
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

  isGitChange(parentNode: FileNode, filename: string): boolean {
    return !!gitManager.getMixedStatus(
      parentNode.fullpath + '/' + filename,
      false,
    );
  }

  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return this.config.get('file.column.' + name, defaultValue)!;
  }

  async init() {
    if (this.config.get('activeMode')) {
      if (this.config.get('file.autoReveal')) {
        this.disposables.push(
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
            const fullpath = this.bufManager.getBufferNode(bufnr)?.fullpath;
            if (!fullpath) {
              return;
            }
            const [revealNode, notifiers] = await this.revealNodeByPathNotifier(
              fullpath,
            );
            if (revealNode) {
              await Notifier.runAll(notifiers);
            }
          }, 200),
        );
      }
    }

    this.disposables.push(
      this.events.on('loaded', () => {
        this.copiedNodes.clear();
        this.cutNodes.clear();
      }),
    );

    loadFileActions(this.action);
  }

  async open() {
    await this.sourcePainters.parseTemplate(
      'root',
      await this.explorer.args.value(fileArgOptions.fileRootTemplate),
      await this.explorer.args.value(fileArgOptions.fileRootLabelingTemplate),
    );

    await this.sourcePainters.parseTemplate(
      'child',
      await this.explorer.args.value(fileArgOptions.fileChildTemplate),
      await this.explorer.args.value(fileArgOptions.fileChildLabelingTemplate),
    );

    this.root = this.explorer.rootUri;
  }

  async cd(fullpath: string) {
    const { nvim } = this;
    const escapePath = (await nvim.call('fnameescape', fullpath)) as string;
    if (this.config.get<boolean>('file.tabCD')) {
      if (workspace.isNvim || (await nvim.call('exists', [':tcd']))) {
        await nvim.command('tcd ' + escapePath);
        // eslint-disable-next-line no-restricted-properties
        workspace.showMessage(`Tab's CWD is: ${fullpath}`);
      }
    } else {
      await nvim.command('cd ' + escapePath);
      // eslint-disable-next-line no-restricted-properties
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
        return this.bufManager.getBufferNode(bufnr)?.fullpath ?? undefined;
      }
      return;
    }
  }

  async openedNotifier(isFirst: boolean) {
    const args = this.explorer.args;
    const revealPath = await this.revealPath();
    if (!revealPath) {
      if (isFirst) {
        return this.locator.gotoRootNotifier({ col: 1 });
      }
      return Notifier.noop();
    }

    const hasRevealPath = args.has(argOptions.reveal);

    if (this.config.get('file.autoReveal') || hasRevealPath) {
      const [revealNode, notifiers] = await this.revealNodeByPathNotifier(
        revealPath,
      );
      if (revealNode !== undefined) {
        return Notifier.combine(notifiers);
      } else if (isFirst) {
        return Notifier.combine([
          ...notifiers,
          await this.locator.gotoRootNotifier({ col: 1 }),
        ]);
      }
    } else if (isFirst) {
      return this.locator.gotoRootNotifier({ col: 1 });
    }

    return Notifier.noop();
  }

  getPutTargetNode(node: FileNode) {
    if (node.isRoot) {
      return this.view.rootNode;
    } else if (node.expandable && this.view.isExpanded(node)) {
      return node;
    } else if (node.parent) {
      return node.parent;
    } else {
      return this.view.rootNode;
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
    task.waitShow()?.catch(onError);
  }

  async revealNodeByPathNotifier(
    path: string,
    {
      node = this.view.rootNode,
      goto = true,
      render = true,
      compact,
    }: {
      node?: FileNode;
      /**
       * @default true
       */
      goto?: boolean;
      /**
       * @default true
       */
      render?: boolean;
      compact?: boolean;
    } = {},
  ): Promise<[FileNode | undefined, Notifier[]]> {
    path = normalizePath(path);
    const notifiers: Notifier[] = [];

    const revealRecursive = async (
      path: string,
      {
        node,
        goto,
        render,
      }: { node: FileNode; goto: boolean; render: boolean },
    ): Promise<FileNode | undefined> => {
      if (path === node.fullpath) {
        return node;
      } else if (
        node.directory &&
        path.startsWith(node.fullpath + pathLib.sep)
      ) {
        let foundNode: FileNode | undefined = undefined;
        const isRender = render && !this.view.isExpanded(node);
        if (!node.children) {
          node.children = await this.loadInitedChildren(node);
        }
        for (const child of node.children) {
          const childFoundNode = await revealRecursive(path, {
            node: child,
            goto: false,
            render: isRender ? false : render,
          });
          foundNode = childFoundNode;
          if (foundNode) {
            await this.view.expand(node, {
              compact,
              uncompact: false,
              render: false,
              load: false,
            });
            break;
          }
        }
        if (foundNode) {
          if (isRender) {
            const renderNotifier = await this.view.renderNotifier({
              node,
            });
            if (renderNotifier) {
              notifiers.push(renderNotifier);
            }
          }
          if (goto) {
            notifiers.push(await this.locator.gotoNodeNotifier(foundNode));
            notifiers.push(
              Notifier.create(() => this.nvim.command('redraw!', true)),
            );
          }
        }
        return foundNode;
      }
      return;
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
          if (
            this.showOnlyGitChange &&
            !this.isGitChange(parentNode, filename)
          ) {
            return;
          }

          const hidden = this.isHidden(filename);
          if (!this.showHidden && hidden) {
            return;
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
            lstat: lstat || undefined,
          };
          return child;
        } catch (error) {
          onError(error);
          return;
        }
      }),
    );

    return this.sortFiles(files.filter((r): r is FileNode => !!r));
  }
}

sourceManager.registerSource('file', FileSource);
