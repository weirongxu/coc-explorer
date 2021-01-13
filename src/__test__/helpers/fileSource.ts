import pathLib from 'path';
import { FileNode } from '../../source/sources/file/fileSource';
import { generateUri } from '../../util';
import { NodesHelper } from './nodes';

export namespace FileSourceHelper {
  export function genNode(path: string, children?: FileNode[]) {
    const expandable = !!children;
    return {
      name: pathLib.basename(path),
      fullpath: path,
      readonly: false,
      expandable,
      directory: expandable,
      executable: true,
      readable: true,
      writable: true,
      hidden: false,
      type: 'child' as const,
      uid: generateUri(path, 'test'),
      symbolicLink: false,
      children,
    };
  }

  export type NodeItem = { name: string; children?: NodeItem[] };
  export function genNodeTree(root: NodeItem, prefix = ''): FileNode {
    const fullpath = pathLib.join(prefix, root.name);
    const children = root.children
      ? root.children.map((n) => genNodeTree(n, fullpath))
      : undefined;
    const node = genNode(fullpath, children);
    return node;
  }

  export function genLoadChildren(root: NodeItem) {
    const tree = genNodeTree(root);
    const flattenedNodes = NodesHelper.flattenNodes(tree);
    return {
      tree,
      loadChildren: (parentNode: FileNode) => {
        const node = flattenedNodes.find(
          (n) => n.fullpath === parentNode.fullpath,
        );
        return node?.children
          ? [
              ...node.children.map((child) => {
                return { ...child, children: undefined };
              }),
            ]
          : [];
      },
    };
  }
}
