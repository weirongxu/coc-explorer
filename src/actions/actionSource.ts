import { explorerActionList } from '../lists/actions';
import { startCocList } from '../lists/runner';
import { keyMapping } from '../mappings';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { flatten, logger, partition, uniq } from '../util';
import { ActionExplorer } from './actionExplorer';
import { ActionMenu } from './menu';
import { ActionRegistrar } from './registrar';
import { conditionActionRules, noopAction, waitAction } from './special';
import { ActionExp, MappingMode } from './types';

export class ActionSource<
  S extends ExplorerSource<any>,
  TreeNode extends BaseTreeNode<TreeNode>
> extends ActionRegistrar<S, TreeNode> {
  public readonly global: ActionExplorer;
  public readonly source = this.owner;

  constructor(public readonly owner: S, globalActionRegistrar: ActionExplorer) {
    super(owner);
    this.global = globalActionRegistrar;
  }

  registeredActions(): ActionRegistrar.ActionMap<BaseTreeNode<any>> {
    return new Map([
      ...this.global.actions,
      ...(this.actions as ActionRegistrar.ActionMap<any>),
    ]);
  }

  registeredAction(
    name: string,
  ): ActionRegistrar.Action<BaseTreeNode<any>> | undefined {
    return (
      (this.actions.get(name) as
        | ActionRegistrar.Action<BaseTreeNode<any>>
        | undefined) || this.global.actions.get(name)
    );
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
    let waitRelease: undefined | (() => void);
    let curNodes = nodes;

    const subOptions = {
      mode: mode,
      isSubAction: true,
    };
    try {
      if (Array.isArray(actionExp)) {
        for (let i = 0; i < actionExp.length; i++) {
          if (i !== 0) {
            curNodes = [this.source.view.currentNode()];
          }

          const action = actionExp[i];

          if (Array.isArray(action)) {
            await this.doActionExp(action, curNodes, subOptions);
            continue;
          }

          if (action.name === waitAction.name) {
            if (waitRelease || isSubAction) {
              continue;
            }
            waitRelease = await this.global.waitActionMutex.acquire();
            continue;
          }

          const rule = conditionActionRules[action.name];
          if (rule) {
            const [trueNodes, falseNodes] = partition(curNodes, (node) =>
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
            await this.doActionExp(action, curNodes, subOptions);
          }
        }
      } else {
        if (actionExp.name !== noopAction.name) {
          await this.doAction(actionExp.name, curNodes, actionExp.args, mode);
        }
      }
    } catch (error) {
      throw error;
    } finally {
      waitRelease?.();
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

    const { select = false, render = false, reload = false } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    const source = this.source;
    try {
      if (select === true) {
        const allNodes = uniq([...finalNodes, ...source.selectedNodes]);
        source.selectedNodes.clear();
        source.view.requestRenderNodes(allNodes);
        await action.callback.call(source, {
          source,
          nodes: allNodes,
          args,
          mode,
        });
      } else if (select === false) {
        await action.callback.call(source, {
          source,
          nodes: [finalNodes[0]],
          args,
          mode,
        });
      } else if (select === 'visual') {
        await action.callback.call(source, {
          source,
          nodes: finalNodes,
          args,
          mode,
        });
      } else if (select === 'keep') {
        const allNodes = uniq([...finalNodes, ...source.selectedNodes]);
        await action.callback.call(source, {
          source,
          nodes: allNodes,
          args,
          mode,
        });
      }
    } catch (error) {
      throw error;
    } finally {
      if (reload) {
        await source.load(source.view.rootNode);
      } else if (render) {
        await source.view.render();
      }
    }
  }

  async listActionMenu(nodes: TreeNode[]) {
    const actions = this.registeredActions();
    const source = this.source;

    const reverseMappings = await keyMapping.getReversedMappings(
      source.sourceType,
    );

    const task = await startCocList(
      this.source.explorer,
      explorerActionList,
      flatten(
        [...actions.entries()]
          .filter(([actionName]) => actionName !== 'actionMenu')
          .sort(([aName], [bName]) => aName.localeCompare(bName))
          .map(([actionName, { callback, options, description }]) => {
            const keys = reverseMappings[actionName];
            const key = keys ? keys.vmap ?? keys.all : '';
            const list = [
              {
                name: actionName,
                key,
                description,
                callback: async () => {
                  await task.waitExplorerShow();
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
                  const keys = reverseMappings[fullActionName];
                  const key = keys ? keys.vmap ?? keys.all : '';
                  return {
                    name: fullActionName,
                    key,
                    description: description + ' ' + menu.description,
                    callback: async () => {
                      await task.waitExplorerShow();
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
    task.waitExplorerShow()?.catch(logger.error);
  }
}
