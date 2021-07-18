import { BaseTreeNode, ExplorerSource } from '../source/source';
import { ActionMenu } from './menu';
import { MappingMode } from './types';

export namespace ActionRegistrar {
  export type Options = {
    /**
     * @default false
     */
    render: boolean;
    /**
     * @default false
     */
    reload: boolean;
    /**
     * use select
     *
     * - 'visual': Use all visual nodes or current node
     * - 'keep': Use all selected node but no clear it
     * - true: Use selected node and clear it
     * - false: Append one visual node or current node
     * @default false
     */
    select: boolean | 'visual' | 'keep';
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

  export type ActionMap<TreeNode extends BaseTreeNode<TreeNode>> = Map<
    string,
    Action<TreeNode>
  >;
}

export class ActionRegistrar<O, TreeNode extends BaseTreeNode<TreeNode>> {
  public readonly actions: ActionRegistrar.ActionMap<TreeNode> = new Map();

  constructor(public readonly owner: O) {}

  /**
   * add an action that uses the selected node and clear it
   */
  addNodesAction(
    name: string,
    callback: ActionRegistrar.ActionNodesCallback<TreeNode>,
    description: string,
    options: Partial<ActionRegistrar.Options> = {},
  ) {
    this.actions.set(name, {
      callback,
      description,
      options: {
        select: true,
        ...options,
      },
    });
  }

  /**
   * add an action
   */
  addNodeAction(
    name: string,
    callback: ActionRegistrar.ActionNodeCallback<TreeNode>,
    description: string,
    options: Partial<ActionRegistrar.Options> = {},
  ) {
    this.actions.set(name, {
      callback: async ({ source, nodes, args, mode }) => {
        for (const node of nodes) {
          await callback.call(source, { source, node, args, mode });
        }
      },
      description,
      options,
    });
  }
}
