import { BaseTreeNode, NodeUid } from '../source/source';
import { ViewSource } from './viewSource';

type CompactStatus = 'compact' | 'uncompact';

type NodeStore = {
  expanded: boolean;
  compact: CompactStatus;
};

export class ViewNodeStores<TreeNode extends BaseTreeNode<TreeNode>> {
  private internal = (() => {
    const internal = {
      records: new Map<NodeUid, NodeStore>(),
      store(node: TreeNode): NodeStore {
        if (!internal.records.has(node.uid)) {
          internal.records.set(node.uid, {
            expanded: false,
            compact: 'uncompact',
          });
        }
        return internal.records.get(node.uid)!;
      },
      clear(): void {
        internal.records.clear();
      },
      get<K extends keyof NodeStore>(node: TreeNode, key: K): NodeStore[K] {
        return internal.store(node)[key];
      },
      set<K extends keyof NodeStore>(
        node: TreeNode,
        key: K,
        value: NodeStore[K],
      ): void {
        internal.store(node)[key] = value;
      },
    };
    return internal;
  })();

  enabled: boolean;

  constructor(public viewSource: ViewSource<TreeNode>) {
    const context = viewSource.source.context;
    const stores = viewSource.config.get('expandStores');
    if (typeof stores === 'boolean') {
      this.enabled = stores;
    } else if ('includes' in stores) {
      this.enabled = stores.includes.includes(
        this.viewSource.source.sourceType,
      );
    } else if ('excludes' in stores) {
      this.enabled = !stores.excludes.includes(
        this.viewSource.source.sourceType,
      );
    } else {
      this.enabled = true;
    }
    context.subscriptions.push(
      viewSource.source.explorer.events.on('open-pre', () => {
        if (!this.enabled) {
          this.internal.clear();
        }
      }),
    );
  }

  setExpanded(node: TreeNode, expanded: boolean) {
    expanded ? this.expand(node) : this.collapse(node);
  }

  expand(node: TreeNode) {
    this.internal.set(node, 'expanded', true);
  }

  collapse(node: TreeNode) {
    this.internal.set(node, 'expanded', false);
  }

  isExpanded(node: TreeNode) {
    return this.internal.get(node, 'expanded');
  }

  setCompact(node: TreeNode, compact: CompactStatus) {
    this.internal.set(node, 'compact', compact);
  }

  getCompact(node: TreeNode): CompactStatus {
    return this.internal.get(node, 'compact');
  }
}
