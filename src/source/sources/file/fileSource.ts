import { Notifier } from 'coc-helper';
import { Uri, window, workspace } from 'coc.nvim';
import fs from 'fs';
import { homedir } from 'os';
import pathLib from 'path';
import { argOptions } from '../../../arg/argOptions';
import { getRevealAuto, getRevealWhenOpen } from '../../../config';
import { diagnosticHighlights } from '../../../diagnostic/highlights';
import { onBufEnter } from '../../../events';
import { gitManager } from '../../../git/manager';
import { internalHighlightGroups } from '../../../highlight/internalColors';
import { hlGroupManager } from '../../../highlight/manager';
import { fileList } from '../../../lists/files';
import { startCocList } from '../../../lists/runner';
import { RootStrategyStr } from '../../../types';
import { Explorer } from '../../../types/pkg-config';
import {
  fsAccess,
  fsLstat,
  fsReaddir,
  fsStat,
  getExtensions,
  isWindows,
  listDrive,
  logger,
  normalizePath,
} from '../../../util';
import { RendererSource } from '../../../view/rendererSource';
import { ViewSource } from '../../../view/viewSource';
import { BaseTreeNode, ExplorerSource } from '../../source';
import { sourceManager } from '../../sourceManager';
import { fileArgOptions } from './argOptions';
import { loadFileActions } from './fileActions';
import { fileColumnRegistrar } from './fileColumnRegistrar';
import './load';

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

const hlg = hlGroupManager.linkGroup.bind(hlGroupManager);
const directoryHighlight = hlg('FileDirectory', 'Directory');
export const fileHighlights = {
  title: hlg('FileRoot', 'Constant'),
  hidden: hlg('FileHidden', internalHighlightGroups.CommentColor),
  rootName: hlg('FileRootName', 'Identifier'),
  expandIcon: hlg('FileExpandIcon', 'Directory'),
  fullpath: hlg('FileFullpath', internalHighlightGroups.CommentColor),
  filename: hlg('FileFilename', 'None'),
  directory: directoryHighlight,
  directoryExpanded: hlg('FileDirectoryExpanded', directoryHighlight.group),
  directoryCollapsed: hlg('FileDirectoryCollapsed', directoryHighlight.group),
  linkTarget: hlg('FileLinkTarget', internalHighlightGroups.CommentColor),
  indentLine: hlg('IndentLine', internalHighlightGroups.CommentColor),
  clip: hlg('FileClip', 'Statement'),
  size: hlg('FileSize', 'Constant'),
  readonly: hlg('FileReadonly', 'Operator'),
  modified: hlg('FileModified', 'Operator'),
  timeAccessed: hlg('TimeAccessed', 'Identifier'),
  timeModified: hlg('TimeModified', 'Identifier'),
  timeCreated: hlg('TimeCreated', 'Identifier'),
  diagnosticError: hlg(
    'FileDiagnosticError',
    diagnosticHighlights.diagnosticError.group,
  ),
  diagnosticWarning: hlg(
    'FileDiagnosticWarning',
    diagnosticHighlights.diagnosticWarning.group,
  ),
  filenameDiagnosticError: hlg('FileFilenameDiagnosticError', 'CocErrorSign'),
  filenameDiagnosticWarning: hlg(
    'FileFilenameDiagnosticWarning',
    'CocWarningSign',
  ),
};

export class FileSource extends ExplorerSource<FileNode> {
  scheme = 'file';
  showHidden: boolean = this.config.get<boolean>('file.showHiddenFiles')!;
  showOnlyGitChange = false;
  view: ViewSource<FileNode> = new ViewSource<FileNode>(
    this,
    fileColumnRegistrar,
    {
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
    },
  );
  rootStrategies: RootStrategyStr[] = [];

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

  getNodesByPaths(fullpaths: string[]) {
    const fullpathSet = new Set(fullpaths);
    return this.view.flattenedNodes.filter((node) =>
      fullpathSet.has(node.fullpath),
    );
  }

  isGitChange(parentNode: FileNode, filename: string): boolean {
    return !!gitManager.getMixedStatus(
      `${parentNode.fullpath}/${filename}`,
      false,
    );
  }

  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return this.config.get(`file.column.${name}`, defaultValue)!;
  }

  async init() {
    if (getRevealAuto(this.config)) {
      this.disposables.push(
        onBufEnter(async (bufnr) => {
          if (bufnr === this.explorer.bufnr) {
            return;
          }
          if (!this.explorer.visible()) {
            return;
          }
          if (this.explorer.isFloating) {
            return;
          }
          await this.view.sync(async (r) => {
            const fullpath = this.bufManager.getBufferNode(bufnr)?.fullpath;
            if (!fullpath) {
              return;
            }
            const [revealNode, notifiers] = await this.revealNodeByPathNotifier(
              r,
              fullpath,
            );
            if (revealNode) {
              await Notifier.runAll(notifiers);
            }
          });
        }, 200),
      );
    }

    loadFileActions(this.action);
  }

  async open() {
    await this.view.parseTemplate(
      'root',
      await this.explorer.args.value(fileArgOptions.fileRootTemplate),
      await this.explorer.args.value(fileArgOptions.fileRootLabelingTemplate),
    );

    await this.view.parseTemplate(
      'child',
      await this.explorer.args.value(fileArgOptions.fileChildTemplate),
      await this.explorer.args.value(fileArgOptions.fileChildLabelingTemplate),
    );

    this.root = this.explorer.root;
    this.rootStrategies = this.explorer.argValues.rootStrategies;
  }

  async cd(fullpath: string) {
    const { nvim } = this;
    const escapePath = (await nvim.call('fnameescape', fullpath)) as string;
    type CdCmd = Explorer['explorer.file.cdCommand'];
    let cdCmd: CdCmd;
    const tabCd = this.config.get<boolean>('file.tabCD');
    if (tabCd !== undefined || tabCd !== null) {
      logger.error(
        'explorer.file.tabCD has been deprecated, please use explorer.file.cdCommand instead of it',
      );
      if (tabCd) {
        cdCmd = 'tcd';
      } else {
        cdCmd = 'cd';
      }
    } else {
      cdCmd = this.config.get<CdCmd>('file.cdCommand');
    }
    if (cdCmd === 'tcd') {
      if (workspace.isNvim || (await nvim.call('exists', [':tcd']))) {
        await nvim.command(`tcd ${escapePath}`);
        window.showMessage(`Tab's CWD is: ${fullpath}`);
      }
    } else if (cdCmd === 'cd') {
      await nvim.command(`cd ${escapePath}`);
      window.showMessage(`CWD is: ${fullpath}`);
    }
  }

  async openedNotifier(renderer: RendererSource<FileNode>, isFirst: boolean) {
    const args = this.explorer.args;
    const revealPath = await this.explorer.revealPath();
    if (!revealPath) {
      if (isFirst) {
        return this.locator.gotoRootNotifier({ col: 1 });
      }
      return Notifier.noop();
    }

    const hasRevealPath = args.has(argOptions.reveal);

    if (
      getRevealAuto(this.config) ||
      getRevealWhenOpen(this.config, this.explorer.argValues.revealWhenOpen) ||
      hasRevealPath
    ) {
      const [revealNode, notifiers] = await this.revealNodeByPathNotifier(
        renderer,
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

  async searchByCocList(
    path: string,
    {
      recursive,
      noIgnore,
      strict,
    }: {
      recursive: boolean;
      noIgnore: boolean;
      strict: boolean;
    },
  ) {
    const listArgs = strict ? ['--strict'] : [];
    const task = await startCocList(
      this.explorer,
      fileList,
      {
        showHidden: this.showHidden,
        showIgnores: noIgnore,
        rootPath: path,
        recursive,
        revealCallback: async (loc) => {
          await task.waitExplorerShow();
          await this.view.sync(async (r) => {
            const [, notifiers] = await this.revealNodeByPathNotifier(
              r,
              Uri.parse(loc.uri).fsPath,
            );
            await Notifier.runAll(notifiers);
          });
        },
      },
      listArgs,
    );
    task.waitExplorerShow()?.catch(logger.error);
  }

  filterForReveal(path: string, root: string) {
    const filter = this.config.get('file.reveal.filter');
    const relativePath = path.slice(root.length);
    // filter by literals
    for (const literal of filter.literals ?? []) {
      if (relativePath.includes(literal)) {
        return true;
      }
    }
    // filter by patterns
    for (const pattern of filter.patterns ?? []) {
      if (new RegExp(pattern).test(relativePath)) {
        return true;
      }
    }
    return false;
  }

  async revealNodeByPathNotifier(
    renderer: RendererSource<FileNode>,
    path: string,
    {
      startNode = this.view.rootNode,
      goto = true,
      render = true,
      compact,
    }: {
      startNode?: FileNode;
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
    if (this.filterForReveal(path, startNode.fullpath)) {
      return [undefined, []];
    }
    const notifiers: Notifier[] = [];

    const revealRecursive = async (
      path: string,
      {
        startNode,
        goto,
        render,
      }: { startNode: FileNode; goto: boolean; render: boolean },
    ): Promise<FileNode | undefined> => {
      if (path === startNode.fullpath) {
        return startNode;
      } else if (
        startNode.directory &&
        path.startsWith(startNode.fullpath + pathLib.sep)
      ) {
        let foundNode: FileNode | undefined = undefined;
        const isRender = render && !this.view.isExpanded(startNode);
        if (!startNode.children) {
          startNode.children = await this.loadInitedChildren(startNode);
        }
        for (const child of startNode.children) {
          const childFoundNode = await revealRecursive(path, {
            startNode: child,
            goto: false,
            render: isRender ? false : render,
          });
          foundNode = childFoundNode;
          if (foundNode) {
            await this.view.expand(startNode, {
              compact,
              uncompact: false,
              render: false,
            });
            break;
          }
        }
        if (foundNode) {
          if (isRender) {
            const renderNotifier = await renderer.renderNotifier({
              node: startNode,
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
    };

    const foundNode = await revealRecursive(path, {
      startNode,
      goto,
      render,
    });
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
            isWindows && /^[A-Za-z]:[\\/]$/.test(fullpath)
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
            directory,
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
          logger.error(error);
        }
      }),
    );

    return this.sortFiles(files.filter((r): r is FileNode => !!r));
  }
}

sourceManager.registerSource('file', FileSource);
