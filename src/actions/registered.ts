import { BaseTreeNode } from '../source/source';
import { MappingMode } from './types';

export namespace RegisteredAction {
  export type OptionMenus = Record<
    string,
    | string
    | {
        description: string;
        args?: string;
        actionArgs?: () => string[] | Promise<string[]>;
      }
  >;
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
    menus: RegisteredAction.OptionMenus;
  };

  type Action<TreeNode extends BaseTreeNode<TreeNode>> = {
    description: string;
    options: Partial<Options>;
    callback: (options: {
      nodes: TreeNode[];
      args: string[];
      mode: MappingMode;
    }) => void | Promise<void>;
  };

  export type Map<TreeNode extends BaseTreeNode<TreeNode>> = Record<
    string,
    Action<TreeNode>
  >;

  export function getNormalizeMenus(menus: RegisteredAction.OptionMenus) {
    return Object.entries(menus).map(([key, value]) => {
      const actionArgs = async () => {
        return key.split(/:/);
      };
      return typeof value === 'string'
        ? {
            description: value,
            args: key,
            actionArgs,
          }
        : Object.assign(
            {
              args: key,
              actionArgs,
            },
            value,
          );
    });
  }
}
