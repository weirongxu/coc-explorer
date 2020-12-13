import { BaseTreeNode, ExplorerSource } from '../source/source';
import { ActionMenu } from './menu';
import { MappingMode } from './types';

export namespace ActionRegistrar {
  export type Options = {
    /**
     * @default false
     */
    multi: boolean;
    /**
     * @default false
     */
    render: boolean;
    /**
     * @default false
     */
    reload: boolean;
    /**
     * @default false
     */
    select: boolean;
    args: { name: string; description?: string }[];
    menus: ActionMenu.OptionMenus;
  };

  export type ActionNodeCallback<TreeNode extends BaseTreeNode<TreeNode>> = (
    this: ExplorerSource<TreeNode>,
    options: {
      source: ExplorerSource<TreeNode>;
      node: TreeNode;
      args: string[];
      mode: MappingMode;
    },
  ) => void | Promise<void>;

  export type ActionNodesCallback<TreeNode extends BaseTreeNode<TreeNode>> = (
    this: ExplorerSource<TreeNode>,
    options: {
      source: ExplorerSource<TreeNode>;
      nodes: TreeNode[];
      args: string[];
      mode: MappingMode;
    },
  ) => void | Promise<void>;

  export type Action<TreeNode extends BaseTreeNode<TreeNode>> = {
    description: string;
    options: Partial<Options>;
    callback: ActionNodesCallback<TreeNode>;
  };

  export type Map<TreeNode extends BaseTreeNode<TreeNode>> = Record<
    string,
    Action<TreeNode>
  >;
}

export class ActionRegistrar<O, TreeNode extends BaseTreeNode<TreeNode>> {
  public readonly actions: ActionRegistrar.Map<TreeNode> = {};

  constructor(public readonly owner: O) {}

  addNodesAction(
    name: string,
    callback: ActionRegistrar.ActionNodesCallback<TreeNode>,
    description: string,
    options: Partial<ActionRegistrar.Options> = {},
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
    callback: ActionRegistrar.ActionNodeCallback<TreeNode>,
    description: string,
    options: Partial<ActionRegistrar.Options> = {},
  ) {
    this.actions[name] = {
      callback: async ({ source, nodes, args, mode }) => {
        for (const node of nodes) {
          await callback.call(source, { source, node, args, mode });
        }
      },
      description,
      options,
    };
  }
}
