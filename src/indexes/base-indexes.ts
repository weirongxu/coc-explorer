import { Explorer } from '../explorer';
import {BaseTreeNode} from '../source/source';

export class BaseIndexes {
  lines: number[] = [];
  explorer?: Explorer;

  bindExplorer(explorer: Explorer) {
    this.explorer = explorer;
  }

  updateNodes<TreeNode extends BaseTreeNode<TreeNode>>(nodes: TreeNode[]) {
  }
}
