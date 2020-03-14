import { Buffer, ExtensionContext, Window, workspace, Disposable } from 'coc.nvim';
import { Action, ActionMode, getMappings } from './mappings';
import { Args, argOptions, ArgContentWidthTypes } from './parse-args';
import { IndexesManager } from './indexes-manager';
import './source/load';
import { BaseTreeNode, ExplorerSource, ActionOptions } from './source/source';
import { sourceManager } from './source/source-manager';
import { Range } from 'vscode-languageserver-protocol';
import {
  config,
  getEnableDebug,
  enableWrapscan,
  avoidOnBufEvents,
  onBufEnter,
  PreviewStrategy,
  queueAsyncFunction,
  onCursorMoved,
  Notifier,
} from './util';
import { ExplorerManager } from './explorer-manager';
import { hlGroupManager, HighlightPositionWithLine } from './source/highlight-manager';
import { BuffuerContextVars } from './context-variables';
import { SourceViewBuilder, SourceRowBuilder } from './source/view-builder';
import { FloatingPreview } from './floating/floating-preview';
import { partition } from 'lodash';
import { conditionActionRules } from './actions';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
  arg: hl('HelpArg', 'Identifier'),
  description: hl('HelpDescription', 'Comment'),
  conditional: hl('HelpConditional', 'Conditional'),
};

export class Explorer {
  nvim = workspace.nvim;
  isHelpUI: boolean = false;
  helpHlSrcId = workspace.createNameSpace('coc-explorer-help');
  indexesManager = new IndexesManager(this);
  inited = new BuffuerContextVars<boolean>('inited', this);
  sourceWinid = new BuffuerContextVars<number>('sourceWinid', this);
  globalActions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (nodes: BaseTreeNode<any>[], args: string[]) => void | Promise<void>;
    }
  > = {};
  context: ExtensionContext;
  floatingWindow = new FloatingPreview(this);
  contentWidth = 0;

  private _buffer?: Buffer;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private lastArgSources?: string;
  private isHide = false;

  private static async getExplorerPosition(args: Args) {
    let width: number = 0;
    let height: number = 0;
    let left: number = 0;
    let top: number = 0;
    const position = await args.value(argOptions.position);

    if (position !== 'floating') {
      width = await args.value(argOptions.width);
    } else {
      width = await args.value(argOptions.floatingWidth);
      height = await args.value(argOptions.floatingHeight);
      const [vimWidth, vimHeight] = [
        workspace.env.columns,
        workspace.env.lines - workspace.env.cmdheight,
      ];
      if (width <= 0) {
        width = vimWidth + width;
      }
      if (height <= 0) {
        height = vimHeight + height;
      }
      const floatingPosition = await args.value(argOptions.floatingPosition);
      if (floatingPosition === 'left-center') {
        left = 0;
        top = (vimHeight - height) / 2;
      } else if (floatingPosition === 'center') {
        left = (vimWidth - width) / 2;
        top = (vimHeight - height) / 2;
      } else if (floatingPosition === 'right-center') {
        left = vimWidth - width;
        top = (vimHeight - height) / 2;
      } else {
        [left, top] = floatingPosition;
      }
    }
    return { width, height, top, left };
  }

  static async create(explorerManager: ExplorerManager, args: Args) {
    explorerManager.maxExplorerID += 1;
    const explorer = await avoidOnBufEvents(async () => {
      const position = await args.value(argOptions.position);
      const { width, height, top, left } = await this.getExplorerPosition(args);
      const bufnr = (await workspace.nvim.call('coc_explorer#create', [
        explorerManager.bufferName,
        explorerManager.maxExplorerID,
        position,
        width,
        height,
        left,
        top,
      ])) as number;
      return new Explorer(explorerManager.maxExplorerID, explorerManager, bufnr);
    });
    await explorer.inited.set(true);
    return explorer;
  }

  constructor(
    public explorerID: number,
    public explorerManager: ExplorerManager,
    public bufnr: number,
  ) {
    this.context = explorerManager.context;

    if (config.get<boolean>('previewAction.onHover')!) {
      onCursorMoved(async (bufnr) => {
        if (bufnr === this.bufnr) {
          await this.floatingWindow.hoverPreview();
        }
      });
      onBufEnter(async (bufnr) => {
        if (bufnr === this.bufnr) {
          await this.floatingWindow.hoverPreview();
        } else {
          this.floatingWindow.hoverPreviewCancel();
        }
      });
    }

    this.addGlobalAction(
      'nodePrev',
      async () => {
        const line = await this.currentLineIndex();
        if (line !== null) {
          await this.gotoLineIndex(line - 1, 1);
        }
      },
      'previous node',
    );
    this.addGlobalAction(
      'nodeNext',
      async () => {
        const line = await this.currentLineIndex();
        if (line !== null) {
          await this.gotoLineIndex(line + 1, 1);
        }
      },
      'next node',
    );
    this.addGlobalAction(
      'expandablePrev',
      async () => {
        const getExpandableLine = async (
          sourceIndex: number,
          startIndex: number,
          startSourceIndex = sourceIndex,
        ) => {
          const source = this.sources[sourceIndex];
          for (let i = startIndex; i >= 0; i--) {
            const node = source.flattenedNodes[i];
            if (node.expandable) {
              await this.gotoLineIndex(source.startLineIndex + source.getLineByNode(node));
              return;
            }
          }

          const nextSourceIndex = (sourceIndex - 1) % this.sources.length;

          if (startSourceIndex === nextSourceIndex) {
            return;
          }

          if (sourceIndex === 0 && !(await enableWrapscan())) {
            return;
          }

          await getExpandableLine(nextSourceIndex, 0);
        };

        const sourceIndex = await this.currentSourceIndex();
        const source = this.sources[sourceIndex];
        const lineIndex = await this.currentLineIndex();
        await getExpandableLine(sourceIndex, lineIndex - source.startLineIndex - 1);
      },
      'previous expandable node',
    );
    this.addGlobalAction(
      'expandableNext',
      async () => {
        const getExpandableLine = async (
          sourceIndex: number,
          startIndex: number,
          startSourceIndex = sourceIndex,
        ) => {
          const source = this.sources[sourceIndex];
          for (let i = startIndex; i < source.height; i++) {
            const node = source.flattenedNodes[i];
            if (node.expandable) {
              await this.gotoLineIndex(source.startLineIndex + source.getLineByNode(node));
              return;
            }
          }

          const nextSourceIndex = (sourceIndex + 1) % this.sources.length;
          if (startSourceIndex === nextSourceIndex) {
            return;
          }

          if (sourceIndex === 0 && !(await enableWrapscan())) {
            return;
          }

          await getExpandableLine(nextSourceIndex, 0);
        };

        const sourceIndex = await this.currentSourceIndex();
        const source = this.sources[sourceIndex];
        const lineIndex = await this.currentLineIndex();
        await getExpandableLine(sourceIndex, lineIndex - source.startLineIndex + 1);
      },
      'next expandable node',
    );
    this.addGlobalAction(
      'normal',
      async (_node, [arg]) => {
        if (arg) {
          await this.nvim.command('normal ' + arg);
        }
      },
      'execute vim normal mode commands',
    );
    this.addGlobalAction(
      'quit',
      async () => {
        await this.quit();
      },
      'quit explorer',
    );
    this.addGlobalAction(
      'preview',
      async (nodes, [arg]) => {
        const source = await this.currentSource();
        if (nodes && nodes[0] && source) {
          const node = nodes[0];
          return source.previewAction(node, arg as PreviewStrategy);
        }
      },
      'preview',
    );

    this.addGlobalAction(
      'gotoSource',
      async (_nodes, [arg]) => {
        const source = this.sources.find((s) => s.sourceName === arg);
        if (source) {
          await source.gotoLineIndex(0);
        }
      },
      'go to source',
    );
    this.addGlobalAction(
      'sourceNext',
      async () => {
        const nextSource = this.sources[(await this.currentSourceIndex()) + 1];
        if (nextSource) {
          await nextSource.gotoLineIndex(0);
        } else if (await enableWrapscan()) {
          await this.sources[0].gotoLineIndex(0);
        }
      },
      'go to next source',
    );
    this.addGlobalAction(
      'sourcePrev',
      async () => {
        const prevSource = this.sources[(await this.currentSourceIndex()) - 1];
        if (prevSource) {
          await prevSource.gotoLineIndex(0);
        } else if (await enableWrapscan()) {
          await this.sources[this.sources.length - 1].gotoLineIndex(0);
        }
      },
      'go to previous source',
    );

    this.addGlobalAction(
      'diagnosticPrev',
      async () => {
        await this.gotoPrevLineIndex('diagnosticError', 'diagnosticWarning');
      },
      'go to previous diagnostic',
    );

    this.addGlobalAction(
      'diagnosticNext',
      async () => {
        await this.gotoNextLineIndex('diagnosticError', 'diagnosticWarning');
      },
      'go to next diagnostic',
    );

    this.addGlobalAction(
      'gitPrev',
      async () => {
        await this.gotoPrevLineIndex('git');
      },
      'go to previous git changed',
    );

    this.addGlobalAction(
      'gitNext',
      async () => {
        await this.gotoNextLineIndex('git');
      },
      'go to next git changed',
    );
  }

  get args(): Args {
    if (!this._args) {
      throw Error('Explorer args not initialized yet');
    }
    return this._args;
  }

  get sources(): ExplorerSource<BaseTreeNode<any>>[] {
    if (!this._sources) {
      throw Error('Explorer sources not initialized yet');
    }
    return this._sources;
  }

  get buffer(): Buffer {
    if (!this._buffer) {
      this._buffer = this.nvim.createBuffer(this.bufnr);
    }
    return this._buffer;
  }

  get win(): Promise<Window | null> {
    return this.winid.then((winid) => {
      if (winid) {
        return this.nvim.createWindow(winid);
      } else {
        return null;
      }
    });
  }

  /**
   * vim winnr of explorer
   */
  get winnr(): Promise<number | null> {
    return this.nvim.call('bufwinnr', this.bufnr).then((winnr: number) => {
      if (winnr > 0) {
        return winnr;
      } else {
        return null;
      }
    });
  }

  /**
   * vim winid of explorer
   */
  get winid(): Promise<number | null> {
    return this.winnr.then(async (winnr) => {
      if (winnr) {
        const winid = (await this.nvim.call('win_getid', winnr)) as number;
        if (winid >= 0) {
          return winid;
        } else {
          return null;
        }
      } else {
        return null;
      }
    });
  }

  async sourceWinnr() {
    const winid = await this.sourceWinid.get();
    if (!winid) {
      return null;
    }
    const winnr = (await this.nvim.call('win_id2win', [winid])) as number;
    if (winnr <= 0 || (await this.explorerManager.winnrs()).includes(winnr)) {
      return null;
    }
    return winnr;
  }

  async sourceBufnrBySourceWinid() {
    const winid = await this.sourceWinid.get();
    if (!winid) {
      return null;
    }
    const bufnr = (await this.nvim.call('winbufnr', [winid])) as number;
    if (bufnr <= 0) {
      return null;
    }
    return bufnr;
  }

  clearHighlightsNotify(hlSrcId: number, lineStart?: number, lineEnd?: number) {
    hlGroupManager.clearHighlights(this, hlSrcId, lineStart, lineEnd);
  }

  executeHighlightsNotify(hlSrcId: number, highlights: HighlightPositionWithLine[]) {
    hlGroupManager.executeHighlightsNotify(this, hlSrcId, highlights);
  }

  async executeHighlightSyntax() {
    const winnr = await this.winnr;
    const curWinnr = await this.nvim.call('winnr');
    if (winnr) {
      this.nvim.pauseNotification();
      if (winnr !== curWinnr) {
        this.nvim.command(`${winnr}wincmd w`, true);
      }
      hlGroupManager.executeHighlightSyntaxNotify();
      if (winnr !== curWinnr) {
        this.nvim.command(`${curWinnr}wincmd w`, true);
      }
      await this.nvim.resumeNotification();
    }
  }

  async resume(args: Args) {
    const win = await this.win;
    if (win) {
      // focus on explorer window
      await this.nvim.command(`${await win.number}wincmd w`);
    } else {
      // resume the explorer window
      const position = await args.value(argOptions.position);
      const { width, height, top, left } = await Explorer.getExplorerPosition(args);
      await this.nvim.call('coc_explorer#resume', [this.bufnr, position, width, height, left, top]);
    }
  }

  async open(args: Args, isFirst: boolean) {
    if (this.isHelpUI) {
      await this.quitHelp();
    }

    await this.executeHighlightSyntax();

    await this.initArgs(args);

    for (const source of this.sources) {
      await source.open();
    }
    const notifiers = [];
    notifiers.push(await this.reloadAllNotifier({ render: false }));
    notifiers.push(await this.renderAllNotifier({ storeCursor: false }));
    notifiers.push(...(await Promise.all(this.sources.map((s) => s.openedNotifier(isFirst)))));
    await Notifier.runAll(notifiers);
  }

  async refreshWidth() {
    const window = await this.win;
    if (!window) {
      return;
    }

    const setWidth = async (contentWidthType: ArgContentWidthTypes, contentWidth: number) => {
      if (contentWidth <= 0) {
        let contentBaseWidth: number | undefined;
        if (contentWidthType === 'win-width') {
          contentBaseWidth = await window?.width;
        } else if (contentWidthType === 'vim-width') {
          contentBaseWidth = (await workspace.nvim.eval('&columns')) as number;
        }
        if (contentBaseWidth) {
          this.contentWidth = contentBaseWidth + contentWidth;
          return true;
        }
      } else {
        this.contentWidth = contentWidth;
        return true;
      }
    };

    const position = await this.args.value(argOptions.position);
    if (position === 'floating') {
      if (await setWidth('win-width', await this.args.value(argOptions.floatingContentWidth))) {
        return;
      }
    }

    if (
      await setWidth(
        await this.args.value(argOptions.contentWidthType),
        await this.args.value(argOptions.contentWidth),
      )
    ) {
      return;
    }
  }

  async tryQuitOnOpen() {
    if (
      config.get<boolean>('quitOnOpen') ||
      (await this.args.value(argOptions.position)) === 'floating'
    ) {
      await this.quit();
    }
  }

  async hide() {
    this.isHide = true;
    await this.quit();
  }

  async show() {
    if (this.isHide) {
      this.isHide = false;
      await this.resume(this.args);
    }
  }

  async quit() {
    const win = await this.win;
    if (win) {
      await this.nvim.command(`${await win.number}wincmd q`);
      // win.close() not work in nvim 3.8
      // await win.close(true);
    }
  }

  private async initArgs(args: Args) {
    this._args = args;
    const sources = await args.value(argOptions.sources);
    if (!sources) {
      return;
    }
    if (!this.lastArgSources || this.lastArgSources !== sources.toString()) {
      this.lastArgSources = sources.toString();

      this._sources = sources
        .map((sourceArg) => sourceManager.createSource(sourceArg.name, this, sourceArg.expand))
        .filter((source): source is ExplorerSource<any> => source !== null);
    }

    this.explorerManager.rootPathRecords.add(await this.args.value(argOptions.rootUri));
  }

  addGlobalAction(
    name: string,
    callback: (nodes: BaseTreeNode<any>[], args: string[]) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.globalActions[name] = {
      callback,
      description,
      options,
    };
  }

  private _doActionsWithCount?: (
    actions: Action[],
    mode: ActionMode,
    count?: number,
  ) => Promise<void>;
  async doActionsWithCount(actions: Action[], mode: ActionMode, count: number = 1) {
    if (!this._doActionsWithCount) {
      this._doActionsWithCount = queueAsyncFunction(
        async (actions: Action[], mode: ActionMode, count: number = 1) => {
          const now = Date.now();

          for (let c = 0; c < count; c++) {
            await this.doActions(actions, mode);
          }
          const notifiers = await Promise.all(
            this.sources.map((source) => source.emitRequestRenderNodesNotifier()),
          );
          await Notifier.runAll(notifiers);

          if (getEnableDebug()) {
            const actionDisplay = actions.map((a) => [a.name, ...a.args].join(':'));
            // tslint:disable-next-line: ban
            workspace.showMessage(`action(${actionDisplay}): ${Date.now() - now}ms`, 'more');
          }
        },
      );
    }
    return this._doActionsWithCount(actions, mode, count);
  }

  async getSelectedNodesGroup(mode: ActionMode) {
    const { nvim } = this;
    let selectedRange: undefined | Range;
    const document = await workspace.document;
    if (mode === 'v') {
      const range = await workspace.getSelectedRange('v', document);
      if (range) {
        selectedRange = range;
      }
    }
    if (!selectedRange) {
      const line = ((await nvim.call('line', ['.'])) as number) - 1;
      selectedRange = {
        start: { line, character: 0 },
        end: { line, character: 0 },
      };
    }

    const nodesGroup: Map<ExplorerSource<any>, BaseTreeNode<any>[]> = new Map();

    for (
      let lineIndex = selectedRange.start.line;
      lineIndex <= selectedRange.end.line;
      lineIndex++
    ) {
      const [source] = this.findSourceByLineIndex(lineIndex);
      if (!nodesGroup.has(source)) {
        nodesGroup.set(source, []);
      }
      const relativeLineIndex = lineIndex - source.startLineIndex;

      nodesGroup.get(source)!.push(source.flattenedNodes[relativeLineIndex]);
    }

    return nodesGroup;
  }

  async doActions(actions: Action[], mode: ActionMode) {
    const nodesGroup = await this.getSelectedNodesGroup(mode);

    for (const [source, nodes] of nodesGroup.entries()) {
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const rule = conditionActionRules[action.name];
        if (rule) {
          const [trueNodes, falseNodes] = partition(nodes, (n) => rule.filter(n, action.args));
          const [trueAction, falseAction] = [actions[i + 1], actions[i + 2]];
          i += 2;
          await source.doAction(trueAction.name, trueNodes, trueAction.args);
          await source.doAction(falseAction.name, falseNodes, falseAction.args);
        } else {
          await source.doAction(action.name, nodes, action.args);
        }
      }
    }
  }

  addIndexes(name: string, index: number) {
    this.indexesManager.addLine(name, index);
  }

  removeIndexes(name: string, index: number) {
    this.indexesManager.removeLine(name, index);
  }

  async gotoPrevLineIndex(...names: string[]) {
    const lineIndex = await this.indexesManager.prevLineIndex(...names);
    if (lineIndex) {
      await this.gotoLineIndex(lineIndex);
      return true;
    }
    return false;
  }

  async gotoNextLineIndex(...names: string[]) {
    const lineIndex = await this.indexesManager.nextLineIndex(...names);
    if (lineIndex) {
      await this.gotoLineIndex(lineIndex);
      return true;
    }
    return false;
  }

  private findSourceByLineIndex(lineIndex: number) {
    const sourceIndex = this.sources.findIndex((source) => lineIndex < source.endLineIndex);
    if (sourceIndex === -1) {
      const index = this.sources.length - 1;
      return [this.sources[index], index] as const;
    } else {
      return [this.sources[sourceIndex], sourceIndex] as const;
    }
  }

  async currentSource(): Promise<ExplorerSource<BaseTreeNode<any>> | undefined> {
    return this.sources[await this.currentSourceIndex()];
  }

  async currentSourceIndex() {
    const lineIndex = await this.currentLineIndex();
    return this.sources.findIndex(
      (source) => lineIndex >= source.startLineIndex && lineIndex < source.endLineIndex,
    );
  }

  async currentNode() {
    const source = await this.currentSource();
    if (source) {
      const nodeIndex = (await this.currentLineIndex()) - source.startLineIndex;
      return source.flattenedNodes[nodeIndex];
    }
  }

  async currentCursor() {
    const win = await this.win;
    if (win) {
      const [line, col] = await win.cursor;
      const lineIndex = line - 1;
      return {
        lineIndex,
        col: col + 1,
      };
    }
    return null;
  }

  async currentLineIndex() {
    const cursor = await this.currentCursor();
    if (cursor) {
      return cursor.lineIndex;
    }
    return 0;
  }

  async currentCol() {
    const cursor = await this.currentCursor();
    if (cursor) {
      return cursor.col;
    }
    return 0;
  }

  async storeCursor() {
    const storeCursor = await this.currentCursor();
    let storeView = await this.nvim.call('winsaveview');
    storeView = { topline: storeView.topline };
    if (storeCursor) {
      const defaultRestore = async () => {
        const gotoLineNotifier = await this.gotoLineIndexNotifier(
          storeCursor.lineIndex,
          storeCursor.col,
        );
        return Notifier.create(() => {
          this.nvim.call('winrestview', [storeView], true);
          gotoLineNotifier.notify();
        });
      };

      const [, sourceIndex] = this.findSourceByLineIndex(storeCursor.lineIndex);
      const source = this.sources[sourceIndex];

      if (!source) {
        return defaultRestore;
      }

      const relativeLineIndex = storeCursor.lineIndex - source.startLineIndex;
      const storeNode = source.getNodeByLine(relativeLineIndex);

      if (!storeNode) {
        return defaultRestore;
      }

      return async () => {
        const gotoNodeNotifier = await source.gotoNodeNotifier(storeNode, {
          lineIndex: relativeLineIndex,
          col: storeCursor.col,
        });
        return Notifier.create(() => {
          this.nvim.call('winrestview', [storeView], true);
          gotoNodeNotifier.notify();
        });
      };
    }
    return null;
  }

  async gotoLineIndex(lineIndex: number, col?: number) {
    return (await this.gotoLineIndexNotifier(lineIndex, col)).run();
  }

  async gotoLineIndexNotifier(lineIndex: number, col?: number) {
    const finalCol = col === undefined ? await this.currentCol() : col;
    const win = await this.win;
    return Notifier.create(() => {
      if (win) {
        win.setCursor([lineIndex + 1, finalCol - 1], true);
        if (workspace.isVim) {
          this.nvim.command('redraw', true);
        } else {
          this.nvim.command('redraw!', true);
        }
      }
    });
  }

  setLinesNotify(lines: string[], start: number, end: number) {
    this.buffer.setOption('modifiable', true, true);

    this.buffer.setLines(
      lines,
      {
        start,
        end,
        strictIndexing: false,
      },
      true,
    );

    this.buffer.setOption('modifiable', false, true);
  }

  async reloadAllNotifier({ render = true } = {}) {
    const notifiers = await Promise.all(
      this.sources.map((source) => source.reloadNotifier(source.rootNode, { render: false })),
    );
    if (render) {
      notifiers.push(await this.renderAllNotifier({ storeCursor: false }));
    }
    return Notifier.combine(notifiers);
  }

  async renderAllNotifier({ storeCursor = true } = {}) {
    const restoreCursor = storeCursor ? await this.storeCursor() : null;
    const notifiers = await Promise.all(
      this.sources.map((s) => s.renderNotifier({ storeCursor: false, force: true })),
    );
    if (restoreCursor) {
      notifiers.push(await restoreCursor());
    }

    return Notifier.combine(notifiers);
  }

  /**
   * select windows from current tabpage
   */
  async selectWindowsUI(
    selected: (winnr: number) => void | Promise<void>,
    noChoice: () => void | Promise<void> = () => {},
    cancel: () => void | Promise<void> = () => {},
  ) {
    const filterOption = config.get<{
      buftypes: string[];
      filetypes: string[];
      floatingWindows: boolean;
    }>('openAction.select.filter')!;
    const winnr = await this.nvim.call('coc_explorer#select_wins', [
      this.explorerManager.bufferName,
      filterOption.buftypes,
      filterOption.filetypes,
      filterOption.floatingWindows,
    ]);
    if (winnr > 0) {
      await Promise.resolve(selected(winnr));
    } else if (winnr === 0) {
      await Promise.resolve(noChoice());
    } else {
      await Promise.resolve(cancel());
    }
  }

  async showHelp(source: ExplorerSource<any>) {
    this.isHelpUI = true;
    const builder = new SourceViewBuilder(this);
    const width = await this.nvim.call('winwidth', '%');
    const restoreCursor = await this.storeCursor();
    const nodes: BaseTreeNode<any>[] = [];

    let curUid = 0;
    function createNode(): BaseTreeNode<any> {
      curUid += 1;
      return {
        type: '',
        uri: `help://${curUid}`,
        level: 0,
        drawnLine: '',
      };
    }

    nodes.push(
      await builder.drawRowForNode(createNode(), (row) => {
        row.add(`Help for [${source.sourceName}], (use q or <esc> return to explorer)`);
      }),
    );
    nodes.push(
      await builder.drawRowForNode(createNode(), (row) => {
        row.add('—'.repeat(width), { hl: helpHightlights.line });
      }),
    );

    const registeredActions = {
      ...this.globalActions,
      ...source.actions,
    };
    const drawAction = (row: SourceRowBuilder, action: Action) => {
      row.add(action.name, { hl: helpHightlights.action });
      if (action.args) {
        row.add(`(${action.args.join(',')})`, { hl: helpHightlights.arg });
      }
      row.add(' ');
      row.add(registeredActions[action.name].description, { hl: helpHightlights.description });
    };
    const mappings = await getMappings();
    for (const [key, actions] of Object.entries(mappings)) {
      if (!actions.some((action) => action.name in registeredActions)) {
        continue;
      }
      for (let i = 0; i < actions.length; i++) {
        let row = new SourceRowBuilder(builder);
        if (i === 0) {
          row.add(' ');
          row.add(key, { hl: helpHightlights.mappingKey });
          row.add(' - ');
        } else {
          row.add(' '.repeat(key.length + 4));
        }
        const action = actions[i];
        const rule = conditionActionRules[action.name];
        if (rule) {
          row.add('if ' + rule.getDescription(action.args) + ' ', {
            hl: helpHightlights.conditional,
          });
          drawAction(row, actions[i + 1]);
          nodes.push(await row.drawForNode(createNode()));
          row = new SourceRowBuilder(builder);
          row.add(' '.repeat(key.length + 4));
          row.add('else ', { hl: helpHightlights.conditional });
          drawAction(row, actions[i + 2]);
          nodes.push(await row.drawForNode(createNode()));
          i += 2;
        } else {
          drawAction(row, action);
          nodes.push(await row.drawForNode(createNode()));
        }
      }
    }

    this.nvim.pauseNotification();
    this.setLinesNotify(
      nodes.map((n) => n.drawnLine),
      0,
      -1,
    );
    const highlightPositions: HighlightPositionWithLine[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.highlightPositions) {
        highlightPositions.push(
          ...node.highlightPositions.map((hl) => ({
            line: i,
            ...hl,
          })),
        );
      }
    }
    this.executeHighlightsNotify(this.helpHlSrcId, highlightPositions);
    await this.nvim.resumeNotification();

    await this.explorerManager.clearMappings();

    const disposables: Disposable[] = [];
    ['<esc>', 'q'].forEach((key) => {
      disposables.push(
        workspace.registerLocalKeymap(
          'n',
          key,
          async () => {
            disposables.forEach((d) => d.dispose());
            await this.quitHelp();
            const notifiers = [await this.renderAllNotifier({ storeCursor: false })];
            if (restoreCursor) {
              notifiers.push(await restoreCursor());
            }
            await Notifier.runAll(notifiers);
          },
          true,
        ),
      );
    });
  }

  async quitHelp() {
    await this.explorerManager.executeMappings();
    this.isHelpUI = false;
  }
}
