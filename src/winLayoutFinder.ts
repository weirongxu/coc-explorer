import { workspace } from 'coc.nvim';

export type VimWinLayoutGroup = [
  type: 'col' | 'row',
  nodes: VimWinLayoutNode[],
];
export type VimWinLayoutLeaf = [type: 'leaf', winid: number];
export type VimWinLayoutNode = VimWinLayoutGroup | VimWinLayoutLeaf;

export interface WinLayoutBase {
  parent?: {
    group: WinLayoutGroup;
    indexInParent: number;
  };
}
export interface WinLayoutGroup extends WinLayoutBase {
  type: 'col' | 'row';
  children: WinLayoutNode[];
}
export interface WinLayoutLeaf extends WinLayoutBase {
  type: 'leaf';
  winid: number;
}
export type WinLayoutNode = WinLayoutGroup | WinLayoutLeaf;

function convertVimLayoutNode(
  vimLayout: VimWinLayoutNode,
  parent?: WinLayoutBase['parent'],
): WinLayoutNode {
  if (vimLayout[0] === 'leaf') {
    return {
      type: vimLayout[0],
      winid: vimLayout[1],
      parent,
    };
  } else {
    const group: WinLayoutGroup = {
      type: vimLayout[0],
      children: [],
    };
    group.children = vimLayout[1].map((child, idx) =>
      convertVimLayoutNode(child, {
        group,
        indexInParent: idx,
      }),
    );
    return group;
  }
}

export class WinLayoutFinder {
  static async create() {
    const root: VimWinLayoutNode = await workspace.nvim.call('winlayout', []);
    return new this(convertVimLayoutNode(root));
  }

  static getFirstLeafWinid(node: WinLayoutNode): number {
    if (node.type === 'leaf') {
      return node.winid;
    } else {
      return this.getFirstLeafWinid(node.children[0]);
    }
  }

  constructor(public readonly root: WinLayoutNode) {}

  /**
   * @return [node, parent, indexInParent]
   */
  findWinid(
    winid: number,
    beginNode: WinLayoutNode = this.root,
  ): undefined | WinLayoutLeaf {
    if (beginNode.type === 'leaf') {
      if (beginNode.winid === winid) {
        return beginNode;
      } else {
        return;
      }
    } else {
      for (const child of beginNode.children) {
        const target = this.findWinid(winid, child);
        if (target) {
          return target;
        }
      }
      return;
    }
  }

  findClosest(
    beginNode: WinLayoutNode,
    matchWinids: number[],
  ): WinLayoutLeaf | undefined {
    const checked = new Set([beginNode]);
    const queue = [beginNode];
    while (queue.length) {
      const node = queue.shift()!;

      if (node.type === 'leaf') {
        if (matchWinids.includes(node.winid)) {
          return node;
        }
      } else {
        for (const child of node.children) {
          if (!checked.has(child)) {
            queue.push(child);
            checked.add(child);
            continue;
          }
        }
      }

      if (node.parent && !checked.has(node.parent.group)) {
        queue.push(node.parent.group);
        checked.add(node.parent.group);
      }
    }
  }
}
