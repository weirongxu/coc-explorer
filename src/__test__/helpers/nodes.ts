import pathLib from 'path';
import { BaseTreeNode } from '../../source/source';
import { generateUri } from '../../util';

export namespace NodesHelper {
  export function genNode<TreeNode extends BaseTreeNode<TreeNode>>(
    path: string,
    children?: TreeNode[],
  ): TreeNode {
    const expandable = !!children;
    return ({
      name: pathLib.basename(path),
      fullpath: path,
      expandable,
      type: 'child',
      uid: generateUri(path, 'test'),
      children,
    } as unknown) as TreeNode;
  }

  export function flattenNodes<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
  ): TreeNode[] {
    const children: TreeNode[] = [];
    if (node.children) {
      for (const child of node.children) {
        children.push(...flattenNodes(child));
      }
    }
    return [node, ...children];
  }
}
