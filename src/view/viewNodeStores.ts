import { BaseTreeNode, NodeUid } from '../source/source';
import { ViewSource } from './viewSource';

type CompactStatus = 'compact' | 'uncompact';

type NodeStore = {
  expanded: boolean;
  compact: CompactStatus;
};

export class ViewNodeStores<TreeNode extends BaseTreeNode<TreeNode>> {
  private inner = (() => {
    const inner = {
      records: new Map<NodeUid, NodeStore>(),
      store(node: TreeNode): NodeStore {
        if (!inner.records.has(node.uid)) {
          inner.records.set(node.uid, {
            expanded: false,
            compact: 'uncompact',
          });
        }
        return inner.records.get(node.uid)!;
      },
      clear(): void {
        inner.records.clear();
      },
      get<K extends keyof NodeStore>(node: TreeNode, key: K): NodeStore[K] {
        return inner.store(node)[key];
      },
      set<K extends keyof NodeStore>(
        node: TreeNode,
        key: K,
        value: NodeStore[K],
      ): void {
        inner.store(node)[key] = value;
      },
    };
    return inner;
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
          this.inner.clear();
        }
      }),
    );
  }

  setExpanded(node: TreeNode, expanded: boolean) {
    expanded ? this.expand(node) : this.collapse(node);
  }

  expand(node: TreeNode) {
    this.inner.set(node, 'expanded', true);
  }

  collapse(node: TreeNode) {
    this.inner.set(node, 'expanded', false);
  }

  isExpanded(node: TreeNode) {
    return this.inner.get(node, 'expanded');
  }

  setCompact(node: TreeNode, compact: CompactStatus) {
    this.inner.set(node, 'compact', compact);
  }

  getCompact(node: TreeNode): CompactStatus {
    return this.inner.get(node, 'compact');
  }
}
