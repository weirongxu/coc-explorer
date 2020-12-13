import { Mutex } from 'await-semaphore';
import { workspace } from 'coc.nvim';
import { Explorer } from '../explorer';
import { explorerActionList } from '../lists/actions';
import { keyMapping } from '../mappings';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { flatten, Notifier, onError, partition } from '../util';
import { ActionMenu } from './menu';
import { conditionActionRules, waitAction } from './special';
import { ActionExp, MappingMode } from './types';

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

export class ExplorerActionRegistrar extends ActionRegistrar<Explorer, any> {
  public readonly doActionExpMutex = new Mutex();
  public readonly explorer = this.owner;

  constructor(owner: Explorer) {
    super(owner);
  }

  async doActionByKey(key: string, mode: MappingMode, count: number = 1) {
    for (let c = 0; c < count; c++) {
      const selectedLineIndexes = await this.explorer.getSelectedOrCursorLineIndexes(
        mode,
      );
      const lineIndexesGroups = this.explorer.lineIndexesGroupBySource(
        selectedLineIndexes,
      );
      for (const { source, lineIndexes } of lineIndexesGroups) {
        const actionExp = keyMapping.getActionExp(source.sourceType, key);
        if (actionExp) {
          await this.doActionExp(actionExp, {
            mode,
            lineIndexes,
          });
        }
      }
    }
    const notifiers = await Promise.all(
      this.explorer.sources.map((source) =>
        source.emitRequestRenderNodesNotifier(),
      ),
    );
    await Notifier.runAll(notifiers);
  }

  async doActionExp(
    actionExp: ActionExp,
    options: {
      /**
       * @default 1
       */
      count?: number;
      /**
       * @default 'n'
       */
      mode?: MappingMode;
      lineIndexes?: Set<number> | number[];
    } = {},
  ) {
    const count = options.count ?? 1;
    const mode = options.mode ?? 'n';

    const firstLineIndexes = options.lineIndexes
      ? new Set(options.lineIndexes)
      : await this.explorer.getSelectedOrCursorLineIndexes(mode);

    try {
      for (let c = 0; c < count; c++) {
        const lineIndexes =
          c === 0
            ? firstLineIndexes
            : await this.explorer.getSelectedOrCursorLineIndexes(mode);

        const nodesGroup: Map<
          ExplorerSource<any>,
          BaseTreeNode<any>[]
        > = new Map();
        for (const lineIndex of lineIndexes) {
          const { source } = this.explorer.findSourceByLineIndex(lineIndex);
          if (!nodesGroup.has(source)) {
            nodesGroup.set(source, []);
          }
          const relativeLineIndex = lineIndex - source.startLineIndex;

          nodesGroup
            .get(source)!
            .push(source.flattenedNodes[relativeLineIndex]);
        }

        for (const [source, nodes] of nodesGroup.entries()) {
          await source.action.doActionExp(actionExp, nodes, { mode });
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        `Error when do action ${JSON.stringify(actionExp)}`,
        'error',
      );
      onError(error);
    }
  }
}

export class SourceActionRegistrar<
  S extends ExplorerSource<any>,
  TreeNode extends BaseTreeNode<TreeNode>
> extends ActionRegistrar<S, TreeNode> {
  public readonly global: ExplorerActionRegistrar;
  public readonly source = this.owner;

  constructor(
    public readonly owner: S,
    globalActionRegistrar: ExplorerActionRegistrar,
  ) {
    super(owner);
    this.global = globalActionRegistrar;
  }

  registeredActions(): ActionRegistrar.Map<TreeNode> {
    return {
      ...(this.global.actions as ActionRegistrar.Map<TreeNode>),
      ...this.actions,
    };
  }

  registeredAction(name: string): ActionRegistrar.Action<TreeNode> | undefined {
    return this.actions[name] || this.global.actions[name];
  }

  async doActionExp(
    actionExp: ActionExp,
    nodes: TreeNode[],
    options: {
      /**
       * @default 'n'
       */
      mode?: MappingMode;
      /**
       * @default false
       */
      isSubAction?: boolean;
    } = {},
  ) {
    const mode = options.mode ?? 'n';
    const isSubAction = options.isSubAction ?? false;
    let release: undefined | (() => void);

    const subOptions = {
      mode: mode,
      isSubAction: true,
    };
    try {
      if (Array.isArray(actionExp)) {
        for (let i = 0; i < actionExp.length; i++) {
          const action = actionExp[i];

          if (Array.isArray(action)) {
            await this.doActionExp(action, nodes, subOptions);
            continue;
          }

          if (action.name === waitAction.name) {
            if (release || isSubAction) {
              continue;
            }
            release = await this.global.doActionExpMutex.acquire();
            continue;
          }

          const rule = conditionActionRules[action.name];
          if (rule) {
            const [trueNodes, falseNodes] = partition(nodes, (node) =>
              rule.filter(this.source, node, action.args),
            );
            const [trueAction, falseAction] = [
              actionExp[i + 1],
              actionExp[i + 2],
            ];
            i += 2;
            if (trueNodes.length) {
              await this.doActionExp(trueAction, trueNodes, subOptions);
            }
            if (falseNodes.length) {
              await this.doActionExp(falseAction, falseNodes, subOptions);
            }
          } else {
            await this.doActionExp(action, nodes, subOptions);
          }
        }
      } else {
        await this.doAction(actionExp.name, nodes, actionExp.args, mode);
      }
    } catch (error) {
      throw error;
    } finally {
      release?.();
    }
  }

  async doAction(
    name: string,
    nodes: TreeNode | TreeNode[],
    args: string[] = [],
    mode: MappingMode = 'n',
  ) {
    const action = this.registeredAction(name);
    if (!action) {
      return;
    }

    const {
      multi = false,
      render = false,
      reload = false,
      select = false,
    } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    const source = this.source;
    if (select) {
      await action.callback.call(source, {
        source,
        nodes: finalNodes,
        args,
        mode,
      });
    } else if (multi) {
      if (source.selectedNodes.size > 0) {
        const nodes = Array.from(source.selectedNodes);
        source.selectedNodes.clear();
        source.requestRenderNodes(nodes);
        await action.callback.call(source, { source, nodes, args, mode });
      } else {
        await action.callback.call(source, {
          source,
          nodes: finalNodes,
          args,
          mode,
        });
      }
    } else {
      await action.callback.call(source, {
        source,
        nodes: [finalNodes[0]],
        args,
        mode,
      });
    }

    if (reload) {
      await source.load(source.rootNode);
    } else if (render) {
      await source.render();
    }
  }

  async listActionMenu(nodes: TreeNode[]) {
    const actions = this.registeredActions();
    const source = this.source;

    const reverseMappings = await keyMapping.getReversedMappings(
      source.sourceType,
    );

    explorerActionList.setExplorerActions(
      flatten(
        Object.entries(actions)
          .filter(([actionName]) => actionName !== 'actionMenu')
          .sort(([aName], [bName]) => aName.localeCompare(bName))
          .map(([actionName, { callback, options, description }]) => {
            const list = [
              {
                name: actionName,
                key: reverseMappings[actionName],
                description,
                callback: async () => {
                  await task.waitShow();
                  await callback.call(source, {
                    source,
                    nodes,
                    args: [],
                    mode: 'n',
                  });
                },
              },
            ];
            if (options.menus) {
              list.push(
                ...ActionMenu.getNormalizeMenus(options.menus).map((menu) => {
                  const fullActionName = actionName + ':' + menu.args;
                  return {
                    name: fullActionName,
                    key: reverseMappings[fullActionName],
                    description: description + ' ' + menu.description,
                    callback: async () => {
                      await task.waitShow();
                      await callback.call(source, {
                        source,
                        nodes,
                        args: await menu.actionArgs(),
                        mode: 'n',
                      });
                    },
                  };
                }),
              );
            }
            return list;
          }),
      ),
    );
    const task = await source.startCocList(explorerActionList);
    task.waitShow()?.catch(onError);
  }
}
