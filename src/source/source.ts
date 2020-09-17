import {
  Disposable,
  Emitter,
  ExtensionContext,
  IList,
  listManager,
  workspace,
  events,
} from 'coc.nvim';
import { argOptions } from '../argOptions';
import { Explorer } from '../explorer';
import { explorerActionList } from '../lists/actions';
import { onError } from '../logger';
import { MappingMode, getReverseMappings } from '../mappings';
import {
  OpenStrategy,
  PreviewStrategy,
  openStrategyList,
  expandOptionList,
  collapseOptionList,
} from '../types';
import {
  drawnWithIndexRange,
  flatten,
  generateUri,
  Notifier,
  delay,
} from '../util';
import { WinLayoutFinder } from '../winLayoutFinder';
import { HighlightPositionWithLine } from './highlightManager';
import { SourcePainters } from './sourcePainters';
import { InternalEventEmitter } from '../events';
import { clone } from 'lodash-es';
import { RegisteredAction } from '../actions/registered';
import { Class } from 'type-fest';
import { ArgPosition } from '../parseArgs';

export namespace Options {
  export interface Force {
    /**
     * Force
     * @default false
     * @type {boolean}
     */
    force?: boolean;
  }

  export interface RecursiveExpanded {
    /**
     * Recursive for expanded nodes
     * @default false
     * @type {boolean}
     */
    recursiveExpanded?: boolean;
  }

  export type Render<TreeNode extends BaseTreeNode<any>> = {
    node?: TreeNode;
  } & Force;

  export type ExpandNode = {
    /**
     * Recursive
     * @default false
     * @type {boolean}
     */
    recursive?: boolean;
    /**
     * Single child folders will be compressed in a combined node
     * @default Depends on "explorer.autoExpandOptions" settings
     * @type {boolean}
     */
    compact?: boolean;
    /**
     * Reset the combined node
     * @default Depends on "explorer.autoExpandOptions" settings
     * @type {boolean}
     */
    uncompact?: boolean;
    /**
     * Expand single child folder recursively
     * @default Depends on "explorer.autoExpandOptions" settings
     * @type {boolean}
     */
    recursiveSingle?: boolean;
    /**
     * Automatically expand maximum depth of one time
     * @default Depends on "explorer.autoExpandMaxDepth" settings
     * @type {number}
     */
    depth?: number;
    /**
     * Render
     * @default true
     * @type {boolean}
     */
    render?: boolean;
    /**
     * Load children
     * @default true
     * @type {boolean}
     */
    load?: boolean;
  };
}

export type ExpandNodeOptions = {
  recursive?: boolean;
  compact?: boolean;
  uncompact?: boolean;
  recursiveSingle?: boolean;
  depth?: number;
  render?: boolean;
  load?: boolean;
};

export type NodeUid = string;

export interface BaseTreeNode<
  TreeNode extends BaseTreeNode<TreeNode>,
  Type extends string = string
> {
  type: Type;
  isRoot?: boolean;
  uid: NodeUid;
  level?: number;
  expandable?: boolean;
  parent?: TreeNode;
  children?: TreeNode[];
  prevSiblingNode?: TreeNode;
  nextSiblingNode?: TreeNode;
  compacted?: boolean;
}

export type ExplorerSourceClass = Class<ExplorerSource<any>> & {
  enabled: boolean | Promise<boolean>;
};

export abstract class ExplorerSource<TreeNode extends BaseTreeNode<TreeNode>>
  implements Disposable {
  abstract hlSrcId: number;
  abstract rootNode: TreeNode;
  abstract sourcePainters: SourcePainters<TreeNode>;
  startLineIndex: number = 0;
  endLineIndex: number = 0;
  width: number = 0;
  flattenedNodes: TreeNode[] = [];
  showHidden: boolean = false;
  selectedNodes: Set<TreeNode> = new Set();
  rootExpanded = false;
  nvim = workspace.nvim;
  context: ExtensionContext;
  bufManager = this.explorer.explorerManager.bufManager;
  diagnosticManager = this.explorer.explorerManager.diagnosticManager;
  events = new InternalEventEmitter<{
    loaded: (node: TreeNode) => void | Promise<void>;
  }>();

  private requestedRenderNodes: Set<TreeNode> = new Set();
  private isDisposed: boolean = false;
  protected disposables: Disposable[] = [];

  private readonly nodeStores = (() => {
    type CompactStore =
      | undefined
      | { status: 'compact' }
      | { status: 'compacted'; nodes: TreeNode[] }
      | { status: 'uncompact'; nodes: TreeNode[] }
      | { status: 'uncompacted' };

    type NodeStore = {
      expanded: boolean;
      compact?: CompactStore;
    };

    const inner = {
      records: new Map<NodeUid, NodeStore>(),
      store(node: TreeNode): NodeStore {
        if (!inner.records.has(node.uid)) {
          inner.records.set(node.uid, {
            expanded: false,
          });
        }
        return inner.records.get(node.uid)!;
      },
      get<K extends keyof NodeStore>(node: TreeNode, key: K): NodeStore[K] {
        return inner.store(node)[key];
      },
      set<K extends keyof NodeStore>(
        node: TreeNode,
        key: K,
        value: NodeStore[K],
      ) {
        inner.store(node)[key] = value;
      },
    };

    const handles = {
      setExpanded(node: TreeNode, expanded: boolean) {
        expanded ? handles.expand(node) : handles.collapse(node);
      },
      expand(node: TreeNode) {
        inner.set(node, 'expanded', true);
      },
      collapse(node: TreeNode) {
        inner.set(node, 'expanded', false);
      },
      isExpanded(node: TreeNode) {
        return inner.get(node, 'expanded');
      },
      setCompact(node: TreeNode, compact: CompactStore) {
        if (
          compact?.status === 'compacted' ||
          compact?.status === 'uncompact'
        ) {
          node.compacted = true;
        } else {
          node.compacted = false;
        }
        inner.set(node, 'compact', compact);
      },
      getCompact(node: TreeNode): CompactStore {
        return inner.get(node, 'compact');
      },
    };
    return handles;
  })();

  get root() {
    return workspace.cwd;
  }

  config = this.explorer.config;

  icons = ((source) => ({
    get expanded() {
      return (
        source.config.get<string>('icon.expanded') ||
        (source.config.get('icon.enableNerdfont') ? '' : '-')
      );
    },
    get collapsed() {
      return (
        source.config.get<string>('icon.collapsed') ||
        (source.config.get('icon.enableNerdfont') ? '' : '+')
      );
    },
    get selected() {
      return source.config.get<string>('icon.selected')!;
    },
    get hidden() {
      return source.config.get<string>('icon.hidden')!;
    },
  }))(this);

  helper = ((source) => ({
    getUid(uid: string | number) {
      return generateUri(uid.toString(), source.sourceType);
    },
  }))(this);

  actions: RegisteredAction.Map<TreeNode> = {};

  static get enabled(): boolean | Promise<boolean> {
    return true;
  }

  constructor(public sourceType: string, public explorer: Explorer) {
    this.context = this.explorer.context;

    this.addNodeAction(
      'expand',
      async ({ node, args }) => {
        if (node.expandable) {
          const options = (args[0] ?? '').split('|');
          const recursive = options.includes('recursive') || undefined;
          const compact = options.includes('compact') || undefined;
          const uncompact = options.includes('uncompact') || undefined;
          const recursiveSingle =
            options.includes('recursiveSingle') || undefined;
          await this.expand(node, {
            recursive,
            compact,
            uncompact,
            recursiveSingle,
          });
        }
      },
      'expand node',
      {
        multi: true,
        args: [
          {
            name: 'expand options',
            description: expandOptionList.join(' | '),
          },
        ],
        menus: {
          recursive: 'recursively',
          compact: 'single child folders will be compressed in a combined node',
          uncompact: 'reset the combined node',
          'compact|uncompact': 'compact or uncompact',
          recursiveSingle: 'expand single child folder recursively',
        },
      },
    );
    this.addNodeAction(
      'collapse',
      async ({ node, args }) => {
        const options = (args[0] ?? '').split('|');
        const all = options.includes('all');
        const recursive = options.includes('recursive');
        if (all && this.rootNode.children) {
          for (const subNode of this.rootNode.children) {
            if (subNode.expandable && this.isExpanded(subNode)) {
              await this.doAction(
                'collapse',
                subNode,
                options.filter((op) => op !== 'all'),
              );
            }
          }
        } else {
          if (node.expandable && this.isExpanded(node)) {
            await this.collapse(node, { recursive });
          } else if (node.parent) {
            await this.collapse(node.parent, { recursive });
          }
        }
      },
      'collapse node',
      {
        multi: true,
        args: [
          {
            name: 'collapse options',
            description: collapseOptionList.join(' | '),
          },
        ],
        menus: {
          recursive: 'recursively',
          all: 'for all nodes',
        },
      },
    );
    this.addNodeAction(
      'esc',
      async ({ mode }) => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating' && mode === 'n') {
          await this.explorer.quit();
        } else {
          this.requestRenderNodes(Array.from(this.selectedNodes));
          this.selectedNodes.clear();
        }
      },
      'esc action',
    );
    this.addNodeAction(
      'toggleHidden',
      async () => {
        this.showHidden = !this.showHidden;
      },
      'toggle visibility of hidden node',
      { reload: true },
    );
    this.addNodeAction(
      'refresh',
      async () => {
        const loadNotifier = await this.loadNotifier(this.rootNode, {
          force: true,
        });

        this.nvim.pauseNotification();
        this.clearHighlightsNotify();
        loadNotifier?.notify();
        await this.nvim.resumeNotification();
      },
      'refresh',
    );
    this.addNodeAction(
      'help',
      async () => {
        await this.explorer.showHelp(this);
      },
      'show help',
    );
    this.addNodesAction(
      'actionMenu',
      async ({ nodes }) => {
        await this.listActionMenu(nodes);
      },
      'show actions in coc-list',
    );
    this.addNodeAction(
      'select',
      async ({ node }) => {
        this.selectedNodes.add(node);
        this.requestRenderNodes([node]);
      },
      'select node',
      { select: true },
    );
    this.addNodeAction(
      'unselect',
      async ({ node }) => {
        this.selectedNodes.delete(node);
        this.requestRenderNodes([node]);
      },
      'unselect node',
      { select: true },
    );
    this.addNodeAction(
      'toggleSelection',
      async ({ node }) => {
        if (this.selectedNodes.has(node)) {
          await this.doAction('unselect', node);
        } else {
          await this.doAction('select', node);
        }
      },
      'toggle node selection',
      { select: true },
    );
  }

  dispose() {
    this.isDisposed = true;
    this.sourcePainters.dispose();
    this.disposables.forEach((s) => s.dispose());
  }

  get height() {
    return this.flattenedNodes.length;
  }

  bootInit(rootExpanded: boolean) {
    Promise.resolve(this.init()).catch(onError);

    this.rootExpanded = rootExpanded;
    this.nodeStores.setExpanded(this.rootNode, rootExpanded);
  }

  abstract init(): Promise<void>;

  async bootOpen(isFirst: boolean) {
    await this.open(isFirst);
    this.nodeStores.setExpanded(this.rootNode, this.rootExpanded);
  }

  protected abstract open(isFirst: boolean): Promise<void>;

  async openedNotifier(_isFirst: boolean): Promise<Notifier> {
    return Notifier.noop();
  }

  addNodesAction(
    name: string,
    callback: (options: {
      nodes: TreeNode[];
      args: string[];
      mode: MappingMode;
    }) => void | Promise<void>,
    description: string,
    options: Partial<Omit<RegisteredAction.Options, 'multi'>> = {},
  ) {
    this.actions[name] = {
      callback,
      description,
      options: {
        ...options,
        multi: true,
      },
    };
  }

  addNodeAction(
    name: string,
    callback: (options: {
      node: TreeNode;
      args: string[];
      mode: MappingMode;
    }) => void | Promise<void>,
    description: string,
    options: Partial<RegisteredAction.Options> = {},
  ) {
    this.actions[name] = {
      callback: async ({ nodes, args, mode }) => {
        for (const node of nodes) {
          await callback({ node, args, mode });
        }
      },
      description,
      options,
    };
  }

  async doAction(
    name: string,
    nodes: TreeNode | TreeNode[],
    args: string[] = [],
    mode: MappingMode = 'n',
  ) {
    const action = this.actions[name] || this.explorer.globalActions[name];
    if (!action) {
      return;
    }

    const {
      multi = false,
      render = false,
      reload = false,
      select = false,
    } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    if (select) {
      await action.callback({ nodes: finalNodes, args, mode });
    } else if (multi) {
      if (this.selectedNodes.size > 0) {
        const nodes = Array.from(this.selectedNodes);
        this.selectedNodes.clear();
        this.requestRenderNodes(nodes);
        await action.callback({ nodes, args, mode });
      } else {
        await action.callback({ nodes: finalNodes, args, mode });
      }
    } else {
      await action.callback({ nodes: [finalNodes[0]], args, mode });
    }

    if (reload) {
      await this.load(this.rootNode);
    } else if (render) {
      await this.render();
    }
  }

  readonly openActionArgs = [
    {
      name: 'open strategy',
      description: openStrategyList.join(' | '),
    },
    {
      name: 'open with position',
      description: 'line-number,column-number',
    },
  ];

  readonly openActionMenu = {
    select: 'use select window UI',
    'split:plain': 'use vim split',
    'split:intelligent': 'use split like vscode',
    'vsplit:plain': 'use vim vsplit',
    'vsplit:intelligent':
      'use vim vsplit, but keep the explorer in the original position',
    tab: 'vim tab',
    previousBuffer: 'use last used buffer',
    previousWindow: 'use last used window',
    sourceWindow: 'use the window where explorer opened',
  };

  async openAction(
    node: TreeNode,
    getFullpath: () => string | Promise<string>,
    {
      openByWinnr: originalOpenByWinnr,
      args = [],
      position,
    }: {
      openByWinnr?: (winnr: number) => void | Promise<void>;
      args?: string[];
      position?: {
        lineIndex: number;
        columnIndex?: number;
      };
    },
  ) {
    if (node.expandable) {
      return;
    }

    const { nvim } = this;

    const getEscapePath = async () => {
      let path = await getFullpath();
      if (this.config.get('openAction.relativePath')) {
        path = await this.nvim.call('fnamemodify', [path, ':.']);
      }
      return await this.nvim.call('fnameescape', [path]);
    };

    const jumpToNotify = () => {
      if (position) {
        this.nvim.call(
          'cursor',
          [position.lineIndex + 1, (position.columnIndex ?? 0) + 1],
          true,
        );
      }
    };

    const openByWinnr =
      originalOpenByWinnr ??
      (async (winnr: number) => {
        nvim.pauseNotification();
        nvim.command(`${winnr}wincmd w`, true);
        nvim.command(`edit ${await getEscapePath()}`, true);
        jumpToNotify();
        if (workspace.isVim) {
          // Avoid vim highlight not working,
          // https://github.com/weirongxu/coc-explorer/issues/113
          nvim.command('redraw', true);
        }
        (await this.explorer.tryQuitOnOpenNotifier()).notify();
        await nvim.resumeNotification();
      });

    const splitIntelligent = async (
      position: ArgPosition,
      command: 'split' | 'vsplit',
      fallbackStrategy: OpenStrategy,
    ) => {
      const explWinid = await this.explorer.winid;
      if (!explWinid) {
        return;
      }

      const winFinder = await WinLayoutFinder.create();
      const node = winFinder.findWinid(explWinid);
      if (node) {
        if (node.parent && node.parent.group.type === 'row') {
          const target =
            node.parent.group.children[
              node.parent.indexInParent + (position === 'left' ? 1 : -1)
            ];
          if (target) {
            const targetWinid = WinLayoutFinder.getFirstLeafWinid(target);

            nvim.pauseNotification();
            nvim.call('win_gotoid', [targetWinid], true);
            nvim.command(`${command} ${await getEscapePath()}`, true);
            jumpToNotify();
            (await this.explorer.tryQuitOnOpenNotifier()).notify();
            await nvim.resumeNotification();
          }
        } else {
          // only exlorer window or explorer is arranged in columns
          await actions['vsplit:plain']();
        }
      } else {
        // floating
        await actions[fallbackStrategy]();
      }
    };

    const actions: Record<OpenStrategy, () => void | Promise<void>> = {
      select: async () => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating') {
          await this.explorer.hide();
        }
        await this.explorer.selectWindowsUI(
          async (winnr) => {
            await openByWinnr(winnr);
          },
          async () => {
            await actions.vsplit();
          },
          async () => {
            if (position === 'floating') {
              await this.explorer.show();
            }
          },
        );
      },

      split: () => actions['split:intelligent'](),
      'split:plain': async () => {
        nvim.pauseNotification();
        nvim.command(`split ${await getEscapePath()}`, true);
        jumpToNotify();
        (await this.explorer.tryQuitOnOpenNotifier()).notify();
        await nvim.resumeNotification();
      },

      'split:intelligent': async () => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating') {
          await actions['split:plain']();
          return;
        } else if (position === 'tab') {
          await actions.vsplit();
          return;
        }
        await splitIntelligent(position, 'split', 'split:plain');
      },

      vsplit: () => actions['vsplit:intelligent'](),
      'vsplit:plain': async () => {
        nvim.pauseNotification();
        nvim.command(`vsplit ${await getEscapePath()}`, true);
        jumpToNotify();
        (await this.explorer.tryQuitOnOpenNotifier()).notify();
        await nvim.resumeNotification();
      },

      'vsplit:intelligent': async () => {
        const position = await this.explorer.args.value(argOptions.position);
        if (position === 'floating') {
          await actions['vsplit:plain']();
          return;
        } else if (position === 'tab') {
          await actions['vsplit:plain']();
          return;
        }
        await splitIntelligent(position, 'vsplit', 'vsplit:plain');
      },

      tab: async () => {
        await this.explorer.tryQuitOnOpen();
        nvim.pauseNotification();
        nvim.command(`tabedit ${await getEscapePath()}`, true);
        jumpToNotify();
        await nvim.resumeNotification();
      },

      previousBuffer: async () => {
        const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevBufnr();
        if (prevWinnr) {
          await openByWinnr(prevWinnr);
        } else {
          await actions.vsplit();
        }
      },

      previousWindow: async () => {
        const prevWinnr = await this.explorer.explorerManager.prevWinnrByPrevWindowID();
        if (prevWinnr) {
          await openByWinnr(prevWinnr);
        } else {
          await actions.vsplit();
        }
      },

      sourceWindow: async () => {
        const srcWinnr = await this.explorer.sourceWinnr();
        if (srcWinnr) {
          await openByWinnr(srcWinnr);
        } else {
          await actions.vsplit();
        }
      },
    };

    let openStrategy = await this.explorer.args.value(
      argOptions.openActionStrategy,
    );
    if (args.length) {
      openStrategy = args.join(':') as OpenStrategy;
    }
    if (!(openStrategy in actions)) {
      new Error(`openStrategy(${openStrategy}) is not supported`);
    }
    await actions[openStrategy]();
  }

  readonly previewActionMenu = {
    labeling: 'preview for node labeling',
    'labeling:200': 'preview for node labeling with debounce',
  };

  async previewAction(
    node: TreeNode,
    previewStrategy: PreviewStrategy,
    debounceTimeout: number,
  ) {
    const nodeIndex = this.getLineByNode(node);
    if (nodeIndex !== undefined) {
      await this.explorer.floatingPreview.previewNode(
        previewStrategy,
        this,
        node,
        nodeIndex,
        debounceTimeout,
      );
    }
  }

  addIndexing(name: string, relativeLineIndex: number) {
    this.explorer.addIndexing(name, this.startLineIndex + relativeLineIndex);
  }

  removeIndexing(name: string, relativeLineIndex: number) {
    this.explorer.removeIndexing(name, this.startLineIndex + relativeLineIndex);
  }

  async copyToClipboard(content: string) {
    await this.nvim.call('setreg', ['+', content]);
    await this.nvim.call('setreg', ['"', content]);
  }

  async startCocList(list: IList) {
    const isFloating =
      (await this.explorer.args.value(argOptions.position)) === 'floating';
    const floatingHideOnCocList = this.config.get(
      'floating.hideOnCocList',
      true,
    );

    let isShown = true;
    if (isFloating && floatingHideOnCocList) {
      await this.explorer.hide();
      isShown = false;
    }

    const shownExplorerEmitter = new Emitter<void>();
    const listDisposable = listManager.registerList(list);
    await listManager.start([list.name]);
    listDisposable.dispose();

    const eventDisposable = events.on('BufWinLeave', async () => {
      if (
        listManager.ui &&
        listManager.ui.shown &&
        listManager.ui.window?.id !== undefined
      ) {
        return;
      }

      eventDisposable.dispose();

      if (isFloating && !isShown) {
        await delay(200);
        await this.explorer.show();
        shownExplorerEmitter.fire();
      }
    });
    return {
      waitShow() {
        if (isShown) {
          return;
        }
        return new Promise((resolve) => {
          shownExplorerEmitter.event(() => {
            isShown = true;
            resolve();
          });
        });
      },
    };
  }

  async listActionMenu(nodes: TreeNode[]) {
    const actions = {
      ...this.explorer.globalActions,
      ...this.actions,
    };

    const reverseMappings = await getReverseMappings();

    explorerActionList.setExplorerActions(
      flatten(
        Object.entries(actions)
          .filter(([actionName]) => actionName !== 'actionMenu')
          .sort(([aName], [bName]) => aName.localeCompare(bName))
          .map(([actionName, { callback, options, description }]) => {
            const list = [
              {
                name: actionName,
                key: reverseMappings[actionName],
                description,
                async callback() {
                  await task.waitShow();
                  await callback({ nodes, args: [], mode: 'n' });
                },
              },
            ];
            if (options.menus) {
              list.push(
                ...RegisteredAction.getNormalizeMenus(options.menus).map(
                  (menu) => {
                    const fullActionName = actionName + ':' + menu.args;
                    return {
                      name: fullActionName,
                      key: reverseMappings[fullActionName],
                      description: description + ' ' + menu.description,
                      async callback() {
                        await task.waitShow();
                        await callback({
                          nodes,
                          args: await menu.actionArgs(),
                          mode: 'n',
                        });
                      },
                    };
                  },
                ),
              );
            }
            return list;
          }),
      ),
    );
    const task = await this.startCocList(explorerActionList);
    task.waitShow()?.catch(onError);
  }

  isSelectedAny() {
    return this.selectedNodes.size !== 0;
  }

  isSelectedNode(node: TreeNode) {
    return this.selectedNodes.has(node);
  }

  getNodeByLine(lineIndex: number): TreeNode | undefined {
    return this.flattenedNodes[lineIndex];
  }

  /**
   * Get relative line index for source by node
   */
  getLineByNode(node: TreeNode): undefined | number {
    if (node) {
      const line = this.flattenedNodes.findIndex((it) => it.uid === node.uid);
      return line === -1 ? undefined : line;
    } else {
      return 0;
    }
  }

  /**
   * Relative line index for source
   */
  get currentLineIndex() {
    return this.explorer.currentLineIndex - this.startLineIndex;
  }

  currentNode() {
    return this.flattenedNodes[this.currentLineIndex] as TreeNode | undefined;
  }

  async gotoLineIndex(lineIndex: number, col?: number) {
    return (await this.gotoLineIndexNotifier(lineIndex, col)).run();
  }

  gotoLineIndexNotifier(lineIndex: number, col?: number) {
    if (lineIndex < 0) {
      lineIndex = 0;
    }
    if (lineIndex >= this.height) {
      lineIndex = this.height - 1;
    }
    return this.explorer.gotoLineIndexNotifier(
      this.startLineIndex + lineIndex,
      col,
    );
  }

  async gotoRoot({ col }: { col?: number } = {}) {
    return (await this.gotoLineIndexNotifier(0, col)).run();
  }

  gotoRootNotifier({ col }: { col?: number } = {}) {
    return this.gotoLineIndexNotifier(0, col);
  }

  async gotoNode(
    node: TreeNode,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return (await this.gotoNodeNotifier(node, options)).run();
  }

  async gotoNodeNotifier(
    node: TreeNode,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return this.gotoNodeUidNotifier(node.uid, options);
  }

  async gotoNodeUid(
    nodeUid: NodeUid,
    options: { lineIndex?: number; col?: number } = {},
  ) {
    return (await this.gotoNodeUidNotifier(nodeUid, options)).run();
  }

  async gotoNodeUidNotifier(
    nodeUid: NodeUid,
    {
      lineIndex: fallbackLineIndex,
      col = 0,
    }: { lineIndex?: number; col?: number } = {},
  ) {
    const lineIndex = this.flattenedNodes.findIndex((it) => it.uid === nodeUid);
    if (lineIndex !== -1) {
      return this.gotoLineIndexNotifier(lineIndex, col);
    } else if (fallbackLineIndex !== undefined) {
      return this.gotoLineIndexNotifier(fallbackLineIndex, col);
    } else {
      return Notifier.noop();
    }
  }

  currentSourceIndex() {
    return this.explorer.sources.indexOf(this as ExplorerSource<any>);
  }

  abstract loadChildren(
    parentNode: TreeNode,
    options?: Options.Force,
  ): Promise<TreeNode[]>;

  async loadInitedChildren(
    parentNode: TreeNode,
    options?: Options.Force & Options.RecursiveExpanded,
  ) {
    const children = await this.loadChildren(parentNode, options);
    await Promise.all(
      children.map(async (child, i) => {
        child.level = (parentNode.level ?? 0) + 1;
        child.parent = parentNode;
        child.prevSiblingNode = children[i - 1];
        child.nextSiblingNode = children[i + 1];
        if (
          options?.recursiveExpanded &&
          child.expandable &&
          this.isExpanded(child)
        ) {
          child.children = await this.loadInitedChildren(child, options);
        }
      }),
    );
    return children;
  }

  async load(
    parentNode: TreeNode,
    options?: { render?: boolean; force?: boolean },
  ) {
    return (await this.loadNotifier(parentNode, options)).run();
  }

  async loadNotifier(
    parentNode: TreeNode,
    { render = true, force = false } = {},
  ) {
    if (this.isDisposed) {
      return Notifier.noop();
    }
    await this.explorer.refreshWidth();
    this.selectedNodes = new Set();
    if (this.isExpanded(parentNode)) {
      parentNode.children = await this.loadInitedChildren(parentNode, {
        recursiveExpanded: true,
        force,
      });
    }
    await this.events.fire('loaded', parentNode);
    await this.sourcePainters.load(parentNode);
    if (render) {
      return this.renderNotifier({ node: parentNode, force });
    }
    return Notifier.noop();
  }

  private offsetAfterLine(offset: number, afterLine: number) {
    this.explorer.indexingManager.offsetLines(
      offset,
      this.startLineIndex + afterLine + 1,
    );
    this.endLineIndex += offset;
    this.explorer.sources
      .slice(this.currentSourceIndex() + 1)
      .forEach((source) => {
        source.startLineIndex += offset;
        source.endLineIndex += offset;
      });
  }

  setLinesNotifier(lines: string[], startIndex: number, endIndex: number) {
    return this.explorer.setLinesNotifier(
      lines,
      this.startLineIndex + startIndex,
      this.startLineIndex + endIndex,
    );
  }

  flattenByNode(node: TreeNode): TreeNode[] {
    const stack = [node];
    const result: TreeNode[] = [];

    function replaceNodeInSibling<TreeNode extends BaseTreeNode<TreeNode>>(
      oldNode: TreeNode,
      newNode: TreeNode,
    ) {
      if (oldNode.parent?.children) {
        const index = oldNode.parent.children.indexOf(oldNode);
        if (index !== -1) {
          oldNode.parent.children.splice(index, 1, newNode);
        }
      }
    }

    while (stack.length) {
      let node: TreeNode = stack.shift()!;
      if (!node.isRoot) {
        const compactStore = this.nodeStores.getCompact(node);
        if (
          (compactStore?.status === 'compact' ||
            (compactStore?.status === 'compacted' && !node.compacted)) &&
          node.children?.length === 1 &&
          node.children[0].expandable
        ) {
          // Compact node
          let tail = node.children[0];
          this.nodeStores.setCompact(node, undefined);
          const compactedNodes = [node, tail];
          while (tail.children?.length === 1 && tail.children[0].expandable) {
            this.nodeStores.setCompact(tail, undefined);
            tail = tail.children[0];
            compactedNodes.push(tail);
          }
          const compactedNode = clone(tail);
          compactedNode.uid = node.uid;
          compactedNode.level = node.level;
          compactedNode.parent = node.parent;
          this.nodeStores.setCompact(compactedNode, {
            status: 'compacted',
            nodes: compactedNodes,
          });
          replaceNodeInSibling(node, compactedNode);
          node = compactedNode;
        } else if (node.compacted && compactStore?.status === 'uncompact') {
          // Reset compact
          const compactedNode = node;
          this.nodeStores.setCompact(compactedNode, { status: 'uncompacted' });
          const nodes = compactStore.nodes;
          let cur = nodes.shift()!;
          cur.level = compactedNode.level;
          cur.parent = compactedNode.parent;
          replaceNodeInSibling(compactedNode, cur);
          while (nodes.length) {
            const child = nodes.shift()!;
            result.push(cur);
            cur.children = [child];
            child.parent = cur;
            child.level = cur.level! + 1;
            cur = child;
          }
          node = cur;
          node.children = compactedNode.children;
        }
      }
      result.push(node);
      if (node.children && this.isExpanded(node)) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          node.children[i].parent = node;
          node.children[i].level = (node.level ?? 0) + 1;
          stack.unshift(node.children[i]);
        }
      }
    }
    return result;
  }

  private nodeAndChildrenRange(
    node: TreeNode,
  ): { startIndex: number; endIndex: number } | undefined {
    const startIndex = this.flattenedNodes.findIndex(
      (it) => it.uid === node.uid,
    );
    if (startIndex === -1) {
      return;
    }
    const parentLevel = node.level ?? 0;
    let endIndex = this.flattenedNodes.length - 1;
    for (
      let i = startIndex + 1, len = this.flattenedNodes.length;
      i < len;
      i++
    ) {
      if ((this.flattenedNodes[i].level ?? 0) <= parentLevel) {
        endIndex = i - 1;
        break;
      }
    }
    return { startIndex, endIndex };
  }

  isExpanded(node: TreeNode) {
    return this.nodeStores.isExpanded(node);
  }

  getCompact(node: TreeNode) {
    return this.nodeStores.getCompact(node);
  }

  private async expandRender(node: TreeNode) {
    if (!this.isExpanded(node) || !node.children) {
      return;
    }
    const range = this.nodeAndChildrenRange(node);
    if (!range) {
      return;
    }
    const { startIndex, endIndex } = range;
    const needDrawNodes = this.flattenByNode(node);

    await this.sourcePainters.beforeDraw(needDrawNodes, {
      draw: async () => {
        this.flattenedNodes = this.flattenedNodes
          .slice(0, startIndex)
          .concat(needDrawNodes)
          .concat(this.flattenedNodes.slice(endIndex + 1));
        this.offsetAfterLine(
          needDrawNodes.length - 1 - (endIndex - startIndex),
          startIndex,
        );
        const { contents, highlightPositions } = await this.drawNodes(
          needDrawNodes,
        );

        this.nvim.pauseNotification();
        this.setLinesNotifier(contents, startIndex, endIndex + 1).notify();
        this.addHighlightsNotify(highlightPositions);
        if (workspace.isVim) {
          this.nvim.command('redraw', true);
        }
        await this.nvim.resumeNotification();
      },
      drawAll: () => this.render(),
    });
  }

  private async expandRecursive(node: TreeNode, options: Options.ExpandNode) {
    const autoExpandOptions = this.config.get('autoExpandOptions');
    const compact = options.compact ?? autoExpandOptions.includes('compact');
    const uncompact =
      options.uncompact ?? autoExpandOptions.includes('uncompact');
    const recursiveSingle =
      options.recursiveSingle ??
      (autoExpandOptions.includes('recursiveSingle') || compact);
    if (node.expandable) {
      const depth = options.depth ?? 1;
      const compactStore = this.nodeStores.getCompact(node);

      // uncompact
      if (
        node.compacted &&
        compactStore?.status === 'compacted' &&
        this.isExpanded(node)
      ) {
        if (uncompact) {
          this.nodeStores.setCompact(node, {
            status: 'uncompact',
            nodes: compactStore.nodes,
          });
        }
      }

      this.nodeStores.expand(node);
      if (!node.children || (options.load ?? true)) {
        node.children = await this.loadInitedChildren(node, {
          recursiveExpanded: true,
        });
      }

      if (depth > this.config.get('autoExpandMaxDepth')) {
        return;
      }
      const singleExpandableNode =
        node.children.length === 1 && node.children[0].expandable;

      // compact
      if (
        !node.compacted &&
        (compactStore === undefined || compactStore.status === 'uncompacted')
      ) {
        if (compact && singleExpandableNode) {
          this.nodeStores.setCompact(node, {
            status: 'compact',
          });
        }
      }

      if (options.recursive || (singleExpandableNode && recursiveSingle)) {
        await Promise.all(
          node.children.map(async (child) => {
            await this.expandRecursive(child, {
              ...options,
              depth: depth + 1,
            });
          }),
        );
      }
    }
  }

  async expand(node: TreeNode, options: Options.ExpandNode = {}) {
    await this.expandRecursive(node, options);
    if (options.render ?? true) {
      await this.expandRender(node);
    }
  }

  private async collapseRender(node: TreeNode) {
    if (this.isExpanded(node)) {
      return;
    }
    const range = this.nodeAndChildrenRange(node);
    if (!range) {
      return;
    }

    await this.sourcePainters.beforeDraw([node], {
      draw: async () => {
        const { startIndex, endIndex } = range;
        this.flattenedNodes.splice(startIndex + 1, endIndex - startIndex);
        this.explorer.indexingManager.removeLines(
          this.startLineIndex + startIndex + 1,
          this.startLineIndex + endIndex,
        );
        this.offsetAfterLine(-(endIndex - startIndex), endIndex);
        const gotoNotifier = await this.gotoLineIndexNotifier(startIndex, 0);
        const { contents, highlightPositions } = await this.drawNodes([node]);

        this.nvim.pauseNotification();
        this.setLinesNotifier(contents, startIndex, endIndex + 1).notify();
        this.addHighlightsNotify(highlightPositions);
        gotoNotifier.notify();
        if (workspace.isVim) {
          this.nvim.command('redraw', true);
        }
        await this.nvim.resumeNotification();
      },
      drawAll: () => this.render(),
    });
  }

  private async collapseRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.nodeStores.collapse(node);
      if (
        recursive ||
        this.config.get('autoCollapseOptions').includes('recursive')
      ) {
        if (node.children) {
          for (const child of node.children) {
            await this.collapseRecursive(child, recursive);
          }
        }
      }
    }
  }

  async collapse(node: TreeNode, { recursive = false } = {}) {
    await this.collapseRecursive(node, recursive);
    await this.collapseRender(node);
  }

  async drawNodes(nodes: TreeNode[]) {
    const drawnList = await Promise.all(
      nodes.map(async (node) => {
        const nodeIndex = this.flattenedNodes.findIndex(
          (it) => it.uid === node.uid,
        );
        if (nodeIndex < 0) {
          throw new Error(`node(${node.uid}) not found`);
        }
        return this.sourcePainters.drawNode(node, nodeIndex);
      }),
    );

    const startLineIndex = this.startLineIndex;

    return {
      drawnList,
      get contents() {
        return drawnList.map((d) => d.content);
      },
      get highlightPositions(): HighlightPositionWithLine[] {
        return flatten(
          drawnList.map((d) =>
            d.highlightPositions.map((hl) => ({
              lineIndex: startLineIndex + d.nodeIndex,
              ...hl,
            })),
          ),
        );
      },
    };
  }

  addHighlightsNotify(highlights: HighlightPositionWithLine[]) {
    this.explorer.addHighlightsNotify(this.hlSrcId, highlights);
  }

  clearHighlightsNotify(lineStart?: number, lineEnd?: number) {
    this.explorer.clearHighlightsNotify(this.hlSrcId, lineStart, lineEnd);
  }

  requestRenderNodes(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      this.requestedRenderNodes.add(node);
    });
  }

  async emitRequestRenderNodesNotifier() {
    if (this.requestedRenderNodes.size <= 0) {
      return;
    }
    const nodes = Array.from(this.requestedRenderNodes);
    this.requestedRenderNodes.clear();
    return this.renderNodesNotifier(nodes);
  }

  async renderNodesNotifier(nodes: TreeNode[]) {
    return await this.sourcePainters.beforeDraw(nodes, {
      draw: async () => {
        const { drawnList, highlightPositions } = await this.drawNodes(nodes);
        const drawnRangeList = drawnWithIndexRange(drawnList);
        return Notifier.create(() => {
          drawnRangeList.forEach((dr) => {
            this.setLinesNotifier(
              dr.drawnList.map((d) => d.content),
              dr.nodeIndexStart,
              dr.nodeIndexEnd + 1,
            ).notify();
          });
          this.addHighlightsNotify(highlightPositions);
          if (workspace.isVim) {
            this.nvim.command('redraw', true);
          }
        });
      },
      drawAll: () => this.renderNotifier(),
      abort: () => Notifier.noop(),
    });
  }

  async render(options?: Options.Render<TreeNode>) {
    return (await this.renderNotifier(options))?.run();
  }

  async renderNotifier({
    node = this.rootNode,
    force = false,
  }: Options.Render<TreeNode> = {}) {
    if (this.explorer.isHelpUI) {
      return Notifier.noop();
    }

    const { nvim } = this;

    const range = this.nodeAndChildrenRange(node);
    if (!range && !node.isRoot) {
      return Notifier.noop();
    }

    const { startIndex: nodeIndex, endIndex } = range
      ? range
      : { startIndex: 0, endIndex: this.flattenedNodes.length - 1 };
    const oldHeight = endIndex - nodeIndex + 1;
    const needDrawNodes = this.flattenByNode(node);
    const newHeight = needDrawNodes.length;
    this.flattenedNodes = this.flattenedNodes
      .slice(0, nodeIndex)
      .concat(needDrawNodes)
      .concat(this.flattenedNodes.slice(endIndex + 1));

    if (newHeight < oldHeight) {
      this.explorer.indexingManager.removeLines(
        this.startLineIndex + newHeight + 1,
        this.startLineIndex + oldHeight + 1,
      );
    }
    this.offsetAfterLine(newHeight - oldHeight, this.endLineIndex);
    await this.sourcePainters.beforeDraw(needDrawNodes, { force });
    const { contents, highlightPositions } = await this.drawNodes(
      needDrawNodes,
    );

    const sourceIndex = this.currentSourceIndex();
    const isLastSource = this.explorer.sources.length - 1 === sourceIndex;

    return Notifier.create(() => {
      this.explorer
        .setLinesNotifier(
          contents,
          this.startLineIndex + nodeIndex,
          isLastSource && node.isRoot
            ? -1
            : this.startLineIndex + nodeIndex + oldHeight,
        )
        .notify();
      this.addHighlightsNotify(highlightPositions);

      if (workspace.isVim) {
        nvim.command('redraw', true);
      }
    });
  }
}
