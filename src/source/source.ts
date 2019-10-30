import { Buffer, Disposable, listManager, workspace } from 'coc.nvim';
import { Range } from 'vscode-languageserver-protocol';
import { explorerActionList } from '../lists/actions';
import { Explorer } from '../explorer';
import { onError } from '../logger';
import { Action, ActionSyms, mappings, reverseMappings } from '../mappings';
import { config, execNotifyBlock, findLast } from '../util';
import { SourceRowBuilder, SourceViewBuilder } from './view-builder';
import { hlGroupManager } from './highlight-manager';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
  select: boolean;
};

export const enableNerdfont = config.get<string>('icon.enableNerdfont')!;

export const sourceIcons = {
  expanded: config.get<string>('icon.expanded') || (enableNerdfont ? '' : '-'),
  shrinked: config.get<string>('icon.shrinked') || (enableNerdfont ? '' : '+'),
  selected: config.get<string>('icon.selected')!,
  unselected: config.get<string>('icon.unselected')!,
};

const hl = hlGroupManager.hlLinkGroupCommand.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
  arg: hl('HelpArg', 'Identifier'),
  description: hl('HelpDescription', 'Comment'),
};
hlGroupManager.register(helpHightlights);

export interface BaseTreeNode<TreeNode extends BaseTreeNode<TreeNode>> {
  isRoot?: boolean;
  uid: string | null;
  level: number;
  drawnLine: string;
  expandable?: boolean;
  parent?: BaseTreeNode<TreeNode>;
  children?: TreeNode[];
}

export abstract class ExplorerSource<TreeNode extends BaseTreeNode<TreeNode>> {
  abstract name: string;
  startLine: number = 0;
  endLine: number = 0;
  abstract rootNode: TreeNode;
  flattenNodes: (TreeNode)[] = [];
  showHidden: boolean = false;
  selectedNodes: Set<TreeNode> = new Set();
  relativeHlRanges: Record<string, Range[]> = {};
  viewBuilder = new SourceViewBuilder<TreeNode>();
  expandStore = {
    record: new Map<null | string, boolean>(),
    expand(node: TreeNode) {
      this.record.set(node.uid, true);
    },
    shrink(node: TreeNode) {
      this.record.set(node.uid, false);
    },
    isExpanded(node: TreeNode) {
      return this.record.get(node.uid) || false;
    },
  };

  abstract hlSrcId: number;

  actions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (nodes: TreeNode[], arg: string) => void | Promise<void>;
    }
  > = {};
  rootActions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (arg: string) => void | Promise<void>;
    }
  > = {};
  hlIds: number[] = []; // hightlight match ids for vim8.0
  nvim = workspace.nvim;

  private _explorer?: Explorer;
  private bindedExplorer = false;

  constructor() {
    this.addAction(
      'toggleHidden',
      async () => {
        this.showHidden = !this.showHidden;
      },
      'toggle visibility of hidden node',
      { reload: true, multi: false },
    );
    this.addAction(
      'normal',
      async (_node, arg) => {
        await this.nvim.command('normal ' + arg);
      },
      'execute vim normal mode commands',
      { multi: false },
    );
    this.addAction(
      'quit',
      async () => {
        await this.explorer.quit();
      },
      'quit explorer',
      { multi: false },
    );
    this.addAction(
      'refresh',
      async () => {
        await this.reload(this.rootNode);
      },
      'refresh',
      { multi: false },
    );
    this.addAction(
      'help',
      async (nodes) => {
        await this.renderHelp(nodes === null);
      },
      'show help',
      { multi: false },
    );
    this.addAction(
      'actionMenu',
      async (nodes) => {
        await this.actionMenu(nodes);
      },
      'show actions in coc-list',
    );
    this.addNodeAction(
      'select',
      async (node) => {
        this.selectedNodes.add(node);
        await this.render();
      },
      'toggle node selection',
      { multi: false, select: true },
    );
    this.addNodeAction(
      'unselect',
      async (node) => {
        this.selectedNodes.delete(node);
        await this.render();
      },
      'toggle node selection',
      { multi: false, select: true },
    );
    this.addNodeAction(
      'toggleSelection',
      async (node) => {
        if (this.selectedNodes.has(node)) {
          await this.doAction('unselect', node);
        } else {
          await this.doAction('select', node);
        }
        await this.render();
      },
      'toggle node selection',
      { multi: false, select: true },
    );

    this.addAction(
      'diagnosticPrev',
      async (nodes) => {
        const node = nodes ? nodes[0] : this.rootNode;
        if (this instanceof FileSource) {
          const lineIndex = this.getLineByNode(node);
          const prevIndex = findLast(this.diagnosisLineIndexes, (idx) => idx < lineIndex);
          if (prevIndex !== undefined) {
            await this.gotoLineIndex(prevIndex);
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = findLast(
          this.explorer.sources.slice(0, sourceIndex),
          (source) => source instanceof FileSource && source.diagnosisLineIndexes.length > 0,
        ) as undefined | FileSource;
        if (fileSource) {
          const prevIndex =
            fileSource.diagnosisLineIndexes[fileSource.diagnosisLineIndexes.length - 1];
          if (prevIndex !== undefined) {
            await fileSource.gotoLineIndex(prevIndex);
          }
        }
      },
      'go to previous diagnostic',
    );

    this.addAction(
      'diagnosticNext',
      async (nodes) => {
        const node = nodes ? nodes[0] : this.rootNode;
        if (this instanceof FileSource) {
          const lineIndex = this.getLineByNode(node);
          const nextIndex = this.diagnosisLineIndexes.find((idx) => idx > lineIndex);
          if (nextIndex !== undefined) {
            await this.gotoLineIndex(nextIndex);
            return;
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = this.explorer.sources
          .slice(sourceIndex + 1)
          .find(
            (source) => source instanceof FileSource && source.diagnosisLineIndexes.length > 0,
          ) as undefined | FileSource;
        if (fileSource) {
          const nextIndex = fileSource.diagnosisLineIndexes[0];
          if (nextIndex !== undefined) {
            await fileSource.gotoLineIndex(nextIndex);
          }
        }
      },
      'go to next diagnostic',
    );

    this.addAction(
      'gitPrev',
      async (nodes) => {
        const node = nodes ? nodes[0] : this.rootNode;
        if (this instanceof FileSource) {
          const lineIndex = this.getLineByNode(node);
          const prevIndex = findLast(this.gitChangedLineIndexes, (idx) => idx < lineIndex);
          if (prevIndex !== undefined) {
            await this.gotoLineIndex(prevIndex);
            return;
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = findLast(
          this.explorer.sources.slice(0, sourceIndex),
          (source) => source instanceof FileSource && source.gitChangedLineIndexes.length > 0,
        ) as undefined | FileSource;
        if (fileSource) {
          const prevIndex =
            fileSource.gitChangedLineIndexes[fileSource.gitChangedLineIndexes.length - 1];
          if (prevIndex !== undefined) {
            await fileSource.gotoLineIndex(prevIndex);
          }
        }
      },
      'go to previous git changed',
    );

    this.addAction(
      'gitNext',
      async (nodes) => {
        const node = nodes ? nodes[0] : this.rootNode;
        if (this instanceof FileSource) {
          const lineIndex = this.getLineByNode(node);
          const nextIndex = this.gitChangedLineIndexes.find((idx) => idx > lineIndex);
          if (nextIndex !== undefined) {
            await this.gotoLineIndex(nextIndex);
            return;
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = this.explorer.sources
          .slice(sourceIndex + 1)
          .find(
            (source) => source instanceof FileSource && source.gitChangedLineIndexes.length > 0,
          ) as undefined | FileSource;
        if (fileSource) {
          const nextIndex = fileSource.gitChangedLineIndexes[0];
          if (nextIndex !== undefined) {
            await fileSource.gotoLineIndex(nextIndex);
          }
        }
      },
      'go to next git changed',
    );
  }

  bindExplorer(explorer: Explorer, expanded: boolean) {
    if (this.bindedExplorer) {
      return;
    }
    this.bindedExplorer = true;

    this._explorer = explorer;
    this.expanded = expanded;

    // init
    Promise.resolve(this.init()).catch(onError);
  }

  get explorer() {
    if (this._explorer !== undefined) {
      return this._explorer;
    }
    throw new Error(`source(${this.name}) unbound to explorer`);
  }

  /**
   * @returns winnr
   */
  async prevWinnr() {
    const winnr = (await this.nvim.call('bufwinnr', [this.explorer.previousBufnr])) as number;
    if ((await this.explorer.winnr) !== winnr && winnr > 0) {
      return winnr;
    } else {
      return null;
    }
  }

  get expanded() {
    return this.expandStore.isExpanded(this.rootNode);
  }

  set expanded(expanded: boolean) {
    if (expanded) {
      this.expandStore.expand(this.rootNode);
    } else {
      this.expandStore.shrink(this.rootNode);
    }
  }

  get height() {
    return this.flattenNodes.length;
  }

  init() {}

  addGlobalAction(name: ActionSyms, callback: (node: TreeNode, line: number) => void) {
    // TODO
  }

  addAction(
    name: ActionSyms,
    callback: (nodes: TreeNode[] | null, arg: string) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.rootActions[name] = {
      callback: (arg: string) => callback(null, arg),
      description,
      options,
    };
    this.actions[name] = {
      callback,
      description,
      options,
    };
  }

  addRootAction(
    name: ActionSyms,
    callback: (arg: string) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.rootActions[name] = { callback, options, description };
  }

  addNodesAction(
    name: ActionSyms,
    callback: (node: TreeNode[], arg: string) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback,
      description,
      options,
    };
  }

  addNodeAction(
    name: ActionSyms,
    callback: (node: TreeNode, arg: string) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback: async (nodes: TreeNode[], arg) => {
        for (const node of nodes) {
          await callback(node, arg);
        }
      },
      description,
      options,
    };
  }

  async doRootAction(name: ActionSyms, arg: string = '') {
    const action = this.rootActions[name];
    if (!action) {
      return;
    }

    const { render = false, reload = false } = action.options;

    await action.callback(arg);

    if (reload) {
      await this.reload(this.rootNode);
    } else if (render) {
      await this.render();
    }
  }

  async doAction(name: ActionSyms, nodes: TreeNode | TreeNode[], arg: string = '') {
    const action = this.actions[name];
    if (!action) {
      return;
    }

    const { multi = true, render = false, reload = false, select = false } = action.options;

    const finalNodes = Array.isArray(nodes) ? nodes : [nodes];
    if (select) {
      await action.callback(finalNodes, arg);
    } else if (multi) {
      if (this.selectedNodes.size > 0) {
        const nodes = Array.from(this.selectedNodes);
        this.selectedNodes.clear();
        await action.callback(nodes, arg);
      } else {
        await action.callback(finalNodes, arg);
      }
    } else {
      await action.callback([finalNodes[0]], arg);
    }

    if (reload) {
      await this.reload(this.rootNode);
    } else if (render) {
      await this.render();
    }
  }

  async copy(content: string) {
    await this.nvim.call('setreg', ['+', content]);
    await this.nvim.call('setreg', ['"', content]);
  }

  async actionMenu(nodes: TreeNode[] | null) {
    const actions = nodes === null ? this.rootActions : this.actions;
    explorerActionList.setExplorerActions(
      Object.entries(actions)
        .map(([name, { callback, description }]) => ({
          name,
          nodes,
          mappings,
          root: nodes === null,
          key: reverseMappings[name],
          description,
          callback,
        }))
        .filter((a) => a.name !== 'actionMenu'),
    );
    const disposable = listManager.registerList(explorerActionList);
    await listManager.start(['--normal', '--number-select', explorerActionList.name]);
    disposable.dispose();
  }

  isSelectedAny() {
    return this.selectedNodes.size !== 0;
  }

  isSelectedNode(node: TreeNode) {
    return this.selectedNodes.has(node);
  }

  getNodeByLine(lineIndex: number): TreeNode {
    return this.flattenNodes[lineIndex];
  }

  getLineByNode(node: TreeNode): number {
    if (node) {
      return this.flattenNodes.findIndex((it) => it.uid === node.uid);
    } else {
      return 0;
    }
  }

  async gotoLineIndex(lineIndex: number, col?: number, notify = false) {
    await execNotifyBlock(async () => {
      const finalCol = col === undefined ? await this.explorer.currentCol() : col;
      const win = await this.explorer.win;
      if (win) {
        if (lineIndex >= this.height) {
          lineIndex = this.height - 1;
        }
        win.setCursor([this.startLine + lineIndex + 1, finalCol - 1], true);
        if (workspace.env.isVim) {
          this.nvim.command('redraw', true);
        }
      }
    }, notify);
  }

  async gotoRoot({ col, notify = false }: { col?: number; notify?: boolean } = {}) {
    const finalCol = col === undefined ? await this.explorer.currentCol() : col;
    await this.gotoLineIndex(0, finalCol, notify);
  }

  /**
   * if node is null, move to root, otherwise move to node
   */
  async gotoNode(
    node: TreeNode,
    {
      lineIndex: fallbackLineIndex,
      col,
      notify = false,
    }: { lineIndex?: number; col?: number; notify?: boolean } = {},
  ) {
    // if ('isRoot' in node) {
    //   await this.gotoRoot({ col, notify });
    //   return;
    // }
    //
    const finalCol = col === undefined ? await this.explorer.currentCol() : col;
    const lineIndex = this.flattenNodes.findIndex((it) => it.uid === node.uid);
    if (lineIndex !== -1) {
      await this.gotoLineIndex(lineIndex, finalCol, notify);
    } else if (fallbackLineIndex !== undefined) {
      await this.gotoLineIndex(fallbackLineIndex, finalCol, notify);
    } else {
      await this.gotoRoot({ col: finalCol, notify });
    }
  }

  abstract loadChildren(sourceNode: TreeNode): Promise<TreeNode[]>;
  async loaded(_sourceNode: TreeNode): Promise<void> {}
  abstract beforeDraw(nodes: (TreeNode)[]): void | Promise<void>;
  abstract drawNode(node: TreeNode, prevNode: TreeNode, nextNode: TreeNode): void | Promise<void>;

  flattenNode(node: TreeNode) {
    return [node, ...(node.children ? this.flattenChildren(node.children) : [])];
  }

  flattenChildren(nodes: TreeNode[]) {
    const stack = [...nodes];
    const res = [];
    while (stack.length) {
      const node = stack.shift()!;
      res.push(node);
      if (node.children && Array.isArray(node.children) && this.expandStore.isExpanded(node)) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.unshift(node.children[i]);
        }
      }
    }
    return res;
  }

  async drawNodes(nodes: (TreeNode)[]) {
    await this.beforeDraw(nodes);
    for (let i = 0, len = nodes.length; i < len; i++) {
      const node = nodes[i];
      await this.drawNode(
        node,
        i === 0 ? this.rootNode : nodes[i - 1],
        i === len - 1 ? this.rootNode : nodes[i + 1],
      );
    }
  }

  opened(_notify = false): void | Promise<void> {}

  async reload(
    sourceNode: TreeNode,
    { render = true, notify = false }: { buffer?: Buffer; render?: boolean; notify?: boolean } = {},
  ) {
    this.selectedNodes = new Set();
    this.rootNode.children = this.expanded ? await this.loadChildren(sourceNode) : [];
    await this.loaded(sourceNode);
    if (render) {
      await this.render({ notify });
    }
  }

  private offsetAfterLine(afterLine: number, offset: number) {
    this.explorer.indexesManager.offsetLines(this.startLine + afterLine + 1, offset);
    const sourceIndex = this.explorer.sources.indexOf(this);
    this.endLine += offset;
    this.explorer.sources.slice(sourceIndex + 1).forEach((source) => {
      source.startLine += offset;
      source.endLine += offset;
    });
  }

  setLines(lines: string[], startIndex: number, endIndex: number, notify = false) {
    return this.explorer.setLines(
      lines,
      this.startLine + startIndex,
      this.startLine + endIndex,
      notify,
    );
  }

  private async expandNodeRender(node: TreeNode, notify = false) {
    await execNotifyBlock(async () => {
      const nodeIndex = this.flattenNodes.findIndex((it) => it.uid === node.uid);
      if (nodeIndex === -1) {
        return;
      }
      const parentLevel = node.level;
      let endIndex = this.flattenNodes.length;
      for (let i = nodeIndex + 1, len = this.flattenNodes.length; i < len; i++) {
        if (this.flattenNodes[i].level <= parentLevel) {
          endIndex = i;
          break;
        }
      }
      if (this.expandStore.isExpanded(node) && node.children) {
        const displayedNodes = this.flattenNode(node);
        await this.drawNodes(displayedNodes);
        this.flattenNodes = this.flattenNodes
          .slice(0, nodeIndex)
          .concat(displayedNodes)
          .concat(this.flattenNodes.slice(endIndex));
        this.offsetAfterLine(nodeIndex + 1, displayedNodes.length - (endIndex - (nodeIndex + 1)));
        await this.setLines(
          displayedNodes.map((node) => node.drawnLine),
          nodeIndex,
          endIndex,
          true,
        );
      }
    }, notify);
  }

  private async expandNodeRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.expandStore.expand(node);
      node.children = await this.loadChildren(node);
      if (
        recursive ||
        (node.children.length === 1 &&
          node.children[0].expandable &&
          config.get<boolean>('autoExpandSingleNode')!)
      ) {
        await Promise.all(
          node.children.map(async (child) => {
            await this.expandNodeRecursive(child, recursive);
          }),
        );
      }
    }
  }

  async expandNode(node: TreeNode, { recursive = false, notify = false } = {}) {
    await execNotifyBlock(async () => {
      await this.expandNodeRecursive(node, recursive);
      await this.expandNodeRender(node, true);
    }, notify);
  }

  private async shrinkNodeRender(node: TreeNode, notify = false) {
    await execNotifyBlock(async () => {
      const nodeIndex = this.flattenNodes.findIndex((it) => it.uid === node.uid);
      if (nodeIndex === -1) {
        return;
      }
      const parentLevel = node.level;
      let endIndex = this.flattenNodes.length;
      for (let i = nodeIndex + 1, len = this.flattenNodes.length; i < len; i++) {
        if (this.flattenNodes[i].level <= parentLevel) {
          endIndex = i;
          break;
        }
      }
      await this.drawNodes([node]);
      this.flattenNodes.splice(nodeIndex + 1, endIndex - (nodeIndex + 1));
      this.offsetAfterLine(endIndex, -(endIndex - (nodeIndex + 1)));
      await this.setLines([node.drawnLine], nodeIndex, endIndex, true);
    }, notify);
  }

  private async shrinkNodeRecursive(node: TreeNode, recursive: boolean) {
    if (node.expandable) {
      this.expandStore.shrink(node);
      if (recursive || config.get<boolean>('autoShrinkChildren')!) {
        if (node.children) {
          for (const child of node.children) {
            await this.shrinkNodeRecursive(child, recursive);
          }
        }
      }
    }
  }

  async shrinkNode(node: TreeNode, { recursive = false, notify = false } = {}) {
    await execNotifyBlock(async () => {
      await this.shrinkNodeRecursive(node, recursive);
      await this.shrinkNodeRender(node, true);
    }, notify);
  }

  async render({
    notify = false,
    storeCursor = true,
  }: { notify?: boolean; storeCursor?: boolean } = {}) {
    if (this.explorer.isHelpUI) {
      return;
    }

    const { nvim } = this;

    let restore: ((notify: boolean) => Promise<void>) | null = null;
    if (storeCursor) {
      restore = await this.explorer.storeCursor();
    }

    await execNotifyBlock(async () => {
      this.flattenNodes = this.flattenNode(this.rootNode);

      await this.drawNodes(this.flattenNodes);
      await this.partRender(true);

      if (restore) {
        await restore(true);
      }

      if (workspace.env.isVim) {
        nvim.command('redraw', true);
      }
    }, notify);
  }

  private async partRender(notify = false) {
    await execNotifyBlock(async () => {
      const sourceIndex = this.explorer.sources.indexOf(this);
      const isLastSource = this.explorer.sources.length - 1 == sourceIndex;

      await this.explorer.setLines(
        this.flattenNodes.map((node) => node.drawnLine),
        this.startLine,
        isLastSource ? -1 : this.endLine,
        true,
      );

      let lineNumber = this.startLine;
      this.explorer.sources.slice(sourceIndex).forEach((source) => {
        source.startLine = lineNumber;
        lineNumber += source.height;
        source.endLine = lineNumber;
      });
    }, notify);
  }

  /**
   * select windows from current tabpage
   */
  async selectWindowsUI(
    selected: (winnr: number) => void | Promise<void>,
    nothingChoice: () => void | Promise<void> = () => {},
  ) {
    const winnr = await this.nvim.call('coc_explorer#select_wins', [
      this.explorer.name,
      config.get<boolean>('openAction.select.filterFloatWindows')!,
    ]);
    if (winnr > 0) {
      await Promise.resolve(selected(winnr));
    } else if (winnr == 0) {
      await Promise.resolve(nothingChoice());
    }
  }

  async renderHelp(isRoot: boolean) {
    this.explorer.isHelpUI = true;
    const builder = new SourceViewBuilder<null>();
    const width = await this.nvim.call('winwidth', '%');
    const storeCursor = await this.explorer.storeCursor();

    builder.newNode(null, (row) => {
      row.add(
        `Help for [${this.name}${isRoot ? ' root' : ''}], (use q or <esc> return to explorer)`,
      );
    });
    builder.newNode(null, (row) => {
      row.add('—'.repeat(width), helpHightlights.line);
    });

    const registeredActions = isRoot ? this.rootActions : this.actions;
    const drawAction = (row: SourceRowBuilder, action: Action) => {
      row.add(action.name, helpHightlights.action);
      if (action.arg) {
        row.add(`(${action.arg})`, helpHightlights.arg);
      }
      row.add(' ');
      row.add(registeredActions[action.name].description, helpHightlights.description);
    };
    Object.entries(mappings).forEach(([key, actions]) => {
      if (!actions.every((action) => action.name in registeredActions)) {
        return;
      }
      builder.newNode(null, (row) => {
        row.add(' ');
        row.add(key, helpHightlights.mappingKey);
        row.add(' - ');
        drawAction(row, actions[0]);
      });
      actions.slice(1).forEach((action) => {
        builder.newNode(null, (row) => {
          row.add(' '.repeat(key.length + 4));

          drawAction(row, action);
        });
      });
    });

    await execNotifyBlock(async () => {
      await this.explorer.setLines(builder.lines.map(([content]) => content), 0, -1, true);
    });

    await this.explorer.clearMappings();

    const disposables: Disposable[] = [];
    await new Promise((resolve) => {
      ['<esc>', 'q'].forEach((key) => {
        disposables.push(
          workspace.registerLocalKeymap(
            'n',
            key,
            () => {
              resolve();
            },
            true,
          ),
        );
      });
    });
    disposables.forEach((d) => d.dispose());

    await this.quitHelp();
    await this.explorer.renderAll({ storeCursor: false });
    await storeCursor();
  }

  async quitHelp() {
    await this.explorer.executeMappings();
    this.explorer.isHelpUI = false;
  }
}

import { FileSource } from './sources/file/file-source';
