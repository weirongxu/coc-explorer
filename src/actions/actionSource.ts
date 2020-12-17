import { explorerActionList } from '../lists/actions';
import { keyMapping } from '../mappings';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { flatten, onError, partition } from '../util';
import { ActionExplorer } from './actionExplorer';
import { ActionMenu } from './menu';
import { ActionRegistrar } from './registrar';
import { conditionActionRules, waitAction } from './special';
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

  registeredActions(): ActionRegistrar.Map<TreeNode> {
    return {
      ...((this.global.actions as unknown) as ActionRegistrar.Map<TreeNode>),
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
            release = await this.global.actionMutex.acquire();
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
      select: multi = false,
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
        source.view.requestRenderNodes(nodes);
        await action.callback.call(source, {
          source,
          nodes,
          args,
          mode,
        });
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
      await source.load(source.view.rootNode);
    } else if (render) {
      await source.view.render();
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
            const keys = reverseMappings[actionName];
            const key = keys ? keys.vmap ?? keys.all : '';
            const list = [
              {
                name: actionName,
                key,
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
                  const keys = reverseMappings[fullActionName];
                  const key = keys ? keys.vmap ?? keys.all : '';
                  return {
                    name: fullActionName,
                    key,
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
