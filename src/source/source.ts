import { HelperEventEmitter, Notifier, prettyPrint } from 'coc-helper';
import {
  Disposable,
  Emitter,
  events,
  ExtensionContext,
  IList,
  listManager,
  workspace,
} from 'coc.nvim';
import { Class } from 'type-fest';
import { Location } from 'vscode-languageserver-protocol';
import { ActionSource } from '../actions/actionSource';
import { argOptions } from '../arg/argOptions';
import { Explorer } from '../explorer';
import { HighlightSource } from '../highlight/highlightSource';
import { LocatorSource } from '../locator/locatorSource';
import { delay, generateUri, onError } from '../util';
import { ViewSource } from '../view/viewSource';
import { SourcePainters } from './sourcePainters';

export namespace SourceOptions {
  export interface Force {
    /**
     * Force
     * @default false
     */
    force?: boolean;
  }

  export interface RecursiveExpanded {
    /**
     * Recursive for expanded nodes
     * @default false
     */
    recursiveExpanded?: boolean;
  }

  export type ExpandNode = {
    /**
     * Recursive
     * @default false
     */
    recursive?: boolean;
    /**
     * Single child folders will be compressed in a combined node
     * @default Depends on "explorer.autoExpandOptions" settings
     */
    compact?: boolean;
    /**
     * Reset the combined node
     * @default Depends on "explorer.autoExpandOptions" settings
     */
    uncompact?: boolean;
    /**
     * Expand single child folder recursively
     * @default Depends on "explorer.autoExpandOptions" settings
     */
    recursiveSingle?: boolean;
    /**
     * Automatically expand maximum depth of one time
     * @default Depends on "explorer.autoExpandMaxDepth" settings
     */
    depth?: number;
    /**
     * Render
     * @default true
     */
    render?: boolean;
  };

  export type Render<TreeNode extends BaseTreeNode<any>> = {
    node?: TreeNode;
  } & Force;

  export type RenderNode<TreeNode extends BaseTreeNode<any>> =
    | TreeNode
    | {
        nodes: TreeNode[] | Set<TreeNode>;
        /**
         * render parent nodes
         * @default false
         */
        withParents?: boolean;
        /**
         * render children nodes
         * @default false
         */
        withChildren?: boolean;
      };

  export type RenderNodes<TreeNode extends BaseTreeNode<any>> =
    | Set<RenderNode<TreeNode>>
    | RenderNode<TreeNode>[];

  export type RenderPaths =
    | Set<string>
    | (
        | string
        | {
            paths: string[] | Set<string>;
            /**
             * render parent paths
             * @default false
             */
            withParents?: boolean;
            /**
             * render children paths
             * @default false
             */
            withChildren?: boolean;
          }
      )[];
}

export type NodeUid = string;

export interface BaseTreeNode<
  TreeNode extends BaseTreeNode<TreeNode>,
  Type extends string = string
> {
  type: Type;
  isRoot?: boolean;
  uid: NodeUid;
  fullpath?: string;
  location?: Location;
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
  abstract sourcePainters: SourcePainters<TreeNode>;
  abstract view: ViewSource<TreeNode>;
  width: number = 0;
  showHidden: boolean = false;
  selectedNodes: Set<TreeNode> = new Set();
  nvim = workspace.nvim;
  context: ExtensionContext;
  bufManager = this.explorer.explorerManager.bufManager;
  events = new HelperEventEmitter<{
    loaded: (node: TreeNode) => void | Promise<void>;
  }>(onError);
  action = new ActionSource<this, TreeNode>(this, this.explorer.action);
  highlight: HighlightSource;
  locator = new LocatorSource(this);

  private isDisposed: boolean = false;
  protected disposables: Disposable[] = [];

  get root() {
    return workspace.cwd;
  }

  set root(_root: string) {}

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

  static get enabled(): boolean | Promise<boolean> {
    return true;
  }

  constructor(public sourceType: string, public explorer: Explorer) {
    this.context = this.explorer.context;
    this.highlight = new HighlightSource(
      this,
      workspace.createNameSpace(`coc-explorer-${sourceType}`),
    );
  }

  dispose() {
    this.isDisposed = true;
    this.sourcePainters.dispose();
    this.disposables.forEach((s) => s.dispose());
  }

  get height() {
    return this.view.flattenedNodes.length;
  }

  bootInit(rootExpandedForOpen: boolean) {
    Promise.resolve(this.init()).catch(onError);

    this.view.bootInit(rootExpandedForOpen);
  }

  abstract init(): Promise<void>;

  async bootOpen(isFirst: boolean) {
    await this.open(isFirst);
    this.view.bootOpen();
  }

  protected abstract open(isFirst: boolean): Promise<void>;

  async openedNotifier(_isFirst: boolean): Promise<Notifier> {
    return Notifier.noop();
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
            resolve(undefined);
          });
        });
      },
    };
  }

  isSelectedAny() {
    return this.selectedNodes.size !== 0;
  }

  isSelectedNode(node: TreeNode) {
    return this.selectedNodes.has(node);
  }

  abstract loadChildren(
    parentNode: TreeNode,
    options?: SourceOptions.Force,
  ): Promise<TreeNode[]>;

  async loadInitedChildren(
    parentNode: TreeNode,
    options?: SourceOptions.Force & SourceOptions.RecursiveExpanded,
  ) {
    const children = await this.loadChildren(parentNode, options);
    await Promise.all(
      children.map(async (node, i) => {
        node.level = (parentNode.level ?? 0) + 1;
        node.parent = parentNode;
        node.prevSiblingNode = children[i - 1];
        node.nextSiblingNode = children[i + 1];
        if (
          options?.recursiveExpanded &&
          node.expandable &&
          this.view.isExpanded(node)
        ) {
          node.children = await this.loadInitedChildren(node, options);
        }
      }),
    );
    return children;
  }

  async load(node: TreeNode, options?: { render?: boolean; force?: boolean }) {
    return (await this.loadNotifier(node, options)).run();
  }

  async loadNotifier(node: TreeNode, { render = true, force = false } = {}) {
    if (this.isDisposed) {
      return Notifier.noop();
    }
    await this.explorer.refreshWidth();
    this.selectedNodes = new Set();
    if (this.view.isExpanded(node)) {
      node.children = await this.loadInitedChildren(node, {
        recursiveExpanded: true,
        force,
      });
    } else {
      node.children = undefined;
    }
    await this.events.fire('loaded', node);
    await this.sourcePainters.load(node);
    if (render) {
      return this.view.renderNotifier({ node: node, force });
    }
    return Notifier.noop();
  }
}
