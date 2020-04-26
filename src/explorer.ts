import {
  Buffer,
  Disposable,
  ExtensionContext,
  Window,
  workspace,
} from 'coc.nvim';
import { conditionActionRules } from './actions';
import { BuffuerContextVars } from './context-variables';
import { ExplorerManager } from './explorer-manager';
import { FloatingPreview } from './floating/floating-preview';
import { IndexesManager } from './indexes-manager';
import { Action, ActionMode, getMappings } from './mappings';
import { ArgContentWidthTypes, argOptions, Args } from './parse-args';
import {
  HighlightPositionWithLine,
  hlGroupManager,
} from './source/highlight-manager';
import './source/load';
import { ActionOptions, BaseTreeNode, ExplorerSource } from './source/source';
import { sourceManager } from './source/source-manager';
import { SourceRowBuilder, SourceViewBuilder } from './source/view-builder';
import {
  config,
  enableWrapscan,
  getEnableDebug,
  Notifier,
  onBufEnter,
  onCursorMoved,
  PreviewStrategy,
  queueAsyncFunction,
  winByWinid,
  winnrByBufnr,
  winidByWinnr,
  onEvents,
  getEnableFloatingBorder,
  partition,
  getFloatingBorderChars,
  closeWinByBufnrNotifier,
} from './util';

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
  lineIndex = 0;
  helpHlSrcId = workspace.createNameSpace('coc-explorer-help');
  indexesManager = new IndexesManager(this);
  inited = new BuffuerContextVars<boolean>('inited', this);
  sourceWinid = new BuffuerContextVars<number>('sourceWinid', this);
  globalActions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (
        nodes: BaseTreeNode<any>[],
        args: string[],
      ) => void | Promise<void>;
    }
  > = {};
  context: ExtensionContext;
  floatingWindow: FloatingPreview;
  contentWidth = 0;

  private _buffer?: Buffer;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private lastArgSources?: string;
  private isHide = false;

  private static async genExplorerPosition(args: Args) {
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

    const position = await args.value(argOptions.position);
    const { width, height, top, left } = await this.genExplorerPosition(args);
    const [bufnr, floatingBorderBufnr]: [
      number,
      number | null,
    ] = await workspace.nvim.call('coc_explorer#create', [
      explorerManager.bufferName,
      explorerManager.maxExplorerID,
      position,
      width,
      height,
      left,
      top,
      getEnableFloatingBorder(),
      getFloatingBorderChars(),
    ]);

    const explorer = new Explorer(
      explorerManager.maxExplorerID,
      explorerManager,
      bufnr,
      floatingBorderBufnr,
    );

    await explorer.inited.set(true);
    return explorer;
  }

  constructor(
    public explorerID: number,
    public explorerManager: ExplorerManager,
    public bufnr: number,
    public floatingBorderBufnr: number | null,
  ) {
    this.context = explorerManager.context;
    this.floatingWindow = new FloatingPreview(this);

    if (config.get<boolean>('previewAction.onHover')!) {
      this.context.subscriptions.push(
        onCursorMoved(async (bufnr) => {
          if (bufnr === this.bufnr) {
            await this.floatingWindow.hoverPreview();
          }
        }),
        onBufEnter(async (bufnr) => {
          if (bufnr === this.bufnr) {
            await this.floatingWindow.hoverPreview();
          } else {
            this.floatingWindow.hoverPreviewCancel();
          }
        }),
      );
    }

    this.context.subscriptions.push(
      onEvents('BufWinLeave', async (bufnr) => {
        if (bufnr === this.bufnr) {
          await this.quitFloatingBorderWin();
          await this.floatingWindow.floatFactory.close();
        }
      }),
      onCursorMoved(async (bufnr: number) => {
        if (bufnr === this.bufnr) {
          this.lineIndex =
            ((await this.nvim.call('line', ['.'])) as number) - 1;
        }
      }),
    );

    this.addGlobalAction(
      'nodePrev',
      async () => {
        const line = this.lineIndex;
        if (line !== null) {
          await this.gotoLineIndex(line - 1);
        }
      },
      'previous node',
    );
    this.addGlobalAction(
      'nodeNext',
      async () => {
        const line = this.lineIndex;
        if (line !== null) {
          await this.gotoLineIndex(line + 1);
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
              await this.gotoLineIndex(
                source.startLineIndex + source.getLineByNode(node),
              );
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
        const lineIndex = this.lineIndex;
        await getExpandableLine(
          sourceIndex,
          lineIndex - source.startLineIndex - 1,
        );
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
              await this.gotoLineIndex(
                source.startLineIndex + source.getLineByNode(node),
              );
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
        const lineIndex = this.lineIndex;
        await getExpandableLine(
          sourceIndex,
          lineIndex - source.startLineIndex + 1,
        );
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
        const source = this.sources.find((s) => s.sourceType === arg);
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
    return this.winid.then(winByWinid);
  }

  /**
   * vim winnr of explorer
   */
  get winnr(): Promise<number | null> {
    return winnrByBufnr(this.bufnr);
  }

  /**
   * vim winid of explorer
   */
  get winid(): Promise<number | null> {
    return this.winnr.then(winidByWinnr);
  }

  get floatingBorderWin(): Promise<Window | null> {
    return this.floatingBorderWinid.then(winByWinid);
  }

  get floatingBorderWinnr() {
    return winnrByBufnr(this.floatingBorderBufnr);
  }

  get floatingBorderWinid() {
    return this.floatingBorderWinnr.then(winidByWinnr);
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
    hlGroupManager.clearHighlightsNotify(this, hlSrcId, lineStart, lineEnd);
  }

  executeHighlightsNotify(
    hlSrcId: number,
    highlights: HighlightPositionWithLine[],
  ) {
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
      const { width, height, top, left } = await Explorer.genExplorerPosition(
        args,
      );
      await this.nvim.call('coc_explorer#resume', [
        this.bufnr,
        position,
        width,
        height,
        left,
        top,
        this.floatingBorderBufnr,
        getEnableFloatingBorder(),
        getFloatingBorderChars(),
      ]);
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

    await Notifier.runAll([
      await this.reloadAllNotifier(),
      ...(await Promise.all(
        this.sources.map((s) => s.openedNotifier(isFirst)),
      )),
    ]);
  }

  async refreshWidth() {
    const window = await this.win;
    if (!window) {
      return;
    }

    const setWidth = async (
      contentWidthType: ArgContentWidthTypes,
      contentWidth: number,
    ) => {
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
      if (
        await setWidth(
          'win-width',
          await this.args.value(argOptions.floatingContentWidth),
        )
      ) {
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
    const quitonOpen = await this.args.value(argOptions.quitOnOpen);
    if (
      quitonOpen ||
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
    const sourceWinnr = await this.sourceWinnr();
    this.nvim.pauseNotification();
    closeWinByBufnrNotifier(this.bufnr).notify();
    if (sourceWinnr) {
      this.nvim.command(`${sourceWinnr}wincmd w`, true);
    }
    // win.close() not work in nvim 3.8
    // await win.close(true);
    await this.nvim.resumeNotification();
  }

  async quitFloatingBorderWin() {
    if (this.floatingBorderBufnr) {
      await closeWinByBufnrNotifier(this.floatingBorderBufnr).run();
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
        .map((sourceArg) =>
          sourceManager.createSource(sourceArg.name, this, sourceArg.expand),
        )
        .filter((source): source is ExplorerSource<any> => source !== null);
    }

    this.explorerManager.rootPathRecords.add(
      await this.args.value(argOptions.rootUri),
    );
  }

  addGlobalAction(
    name: string,
    callback: (
      nodes: BaseTreeNode<any>[],
      args: string[],
    ) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.globalActions[name] = {
      callback,
      description,
      options,
    };
  }

  async getSelectedLineIndexes(mode: ActionMode) {
    const { nvim } = this;
    const lineIndexes = new Set<number>();
    const document = await workspace.document;
    if (mode === 'v') {
      const range = await workspace.getSelectedRange('v', document);
      if (range) {
        for (
          let lineIndex = range.start.line;
          lineIndex <= range.end.line;
          lineIndex++
        ) {
          lineIndexes.add(lineIndex);
        }
        return lineIndexes;
      }
    }
    const line = ((await nvim.call('line', ['.'])) as number) - 1;
    lineIndexes.add(line);
    return lineIndexes;
  }

  private _doActionsWithCount?: (
    actions: Action[],
    mode: ActionMode,
    count?: number,
    lineIndexes?: number[] | Set<number> | null,
  ) => Promise<void>;
  async doActionsWithCount(
    actions: Action[],
    mode: ActionMode,
    count: number = 1,
    lineIndexes: number[] | Set<number> | null = null,
  ) {
    if (!this._doActionsWithCount) {
      this._doActionsWithCount = queueAsyncFunction(
        async (
          actions: Action[],
          mode: ActionMode,
          count: number = 1,
          lineIndexes: number[] | Set<number> | null = null,
        ) => {
          const now = Date.now();

          const firstLineIndexes = lineIndexes
            ? new Set(lineIndexes)
            : await this.getSelectedLineIndexes(mode);

          for (let c = 0; c < count; c++) {
            const selectedLineIndexes =
              c === 0
                ? firstLineIndexes
                : await this.getSelectedLineIndexes(mode);
            await this.doActions(selectedLineIndexes, actions, mode);
          }
          const notifiers = await Promise.all(
            this.sources.map((source) =>
              source.emitRequestRenderNodesNotifier(),
            ),
          );
          await Notifier.runAll(notifiers);

          if (getEnableDebug()) {
            const actionDisplay = actions.map((a) =>
              [a.name, ...a.args].join(':'),
            );
            // tslint:disable-next-line: ban
            workspace.showMessage(
              `action(${actionDisplay}): ${Date.now() - now}ms`,
              'more',
            );
          }
        },
      );
    }
    return this._doActionsWithCount(actions, mode, count, lineIndexes);
  }

  async doActions(
    selectedLineIndexes: Set<number>,
    actions: Action[],
    _mode: ActionMode,
  ) {
    const nodesGroup: Map<ExplorerSource<any>, BaseTreeNode<any>[]> = new Map();
    for (const lineIndex of selectedLineIndexes) {
      const [source] = this.findSourceByLineIndex(lineIndex);
      if (!nodesGroup.has(source)) {
        nodesGroup.set(source, []);
      }
      const relativeLineIndex = lineIndex - source.startLineIndex;

      nodesGroup.get(source)!.push(source.flattenedNodes[relativeLineIndex]);
    }

    for (const [source, nodes] of nodesGroup.entries()) {
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const rule = conditionActionRules[action.name];
        if (rule) {
          const [trueNodes, falseNodes] = partition(nodes, (n) =>
            rule.filter(n, action.args),
          );
          const [trueAction, falseAction] = [actions[i + 1], actions[i + 2]];
          i += 2;
          if (trueNodes.length) {
            await source.doAction(trueAction.name, trueNodes, trueAction.args);
          }
          if (falseNodes.length) {
            await source.doAction(
              falseAction.name,
              falseNodes,
              falseAction.args,
            );
          }
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
    const sourceIndex = this.sources.findIndex(
      (source) => lineIndex < source.endLineIndex,
    );
    if (sourceIndex === -1) {
      const index = this.sources.length - 1;
      return [this.sources[index], index] as const;
    } else {
      return [this.sources[sourceIndex], sourceIndex] as const;
    }
  }

  async currentSource(): Promise<
    ExplorerSource<BaseTreeNode<any>> | undefined
  > {
    return this.sources[await this.currentSourceIndex()];
  }

  async currentSourceIndex() {
    const lineIndex = this.lineIndex;
    return this.sources.findIndex(
      (source) =>
        lineIndex >= source.startLineIndex && lineIndex < source.endLineIndex,
    );
  }

  async currentNode() {
    const source = await this.currentSource();
    if (source) {
      const nodeIndex = this.lineIndex - source.startLineIndex;
      return source.flattenedNodes[nodeIndex] as
        | BaseTreeNode<any, string>
        | undefined;
    }
  }

  async gotoLineIndex(lineIndex: number) {
    return (await this.gotoLineIndexNotifier(lineIndex)).run();
  }

  async gotoLineIndexNotifier(lineIndex: number, col?: number) {
    const win = await this.win;
    return Notifier.create(() => {
      if (win) {
        this.lineIndex = lineIndex;
        win.setCursor([lineIndex + 1, col ?? 0], true);
        if (workspace.isVim) {
          this.nvim.command('redraw', true);
        } else {
          this.nvim.command('redraw!', true);
        }
      }
    });
  }

  setLinesNotifier(lines: string[], start: number, end: number) {
    return Notifier.create(() => {
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
    });
  }

  async reloadAllNotifier({ render = true } = {}) {
    const notifiers = await Promise.all(
      this.sources.map((source) =>
        source.reloadNotifier(source.rootNode, { render: false }),
      ),
    );
    if (render) {
      notifiers.push(await this.renderAllNotifier());
    }
    return Notifier.combine(notifiers);
  }

  async renderAllNotifier() {
    const notifiers = await Promise.all(
      this.sources.map((s) => s.renderNotifier({ force: true })),
    );

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
    const storeNode = await this.currentNode();
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
        row.add(
          `Help for [${source.sourceType}], (use q or <esc> return to explorer)`,
        );
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
      if (action.name in registeredActions) {
        row.add(registeredActions[action.name].description, {
          hl: helpHightlights.description,
        });
      }
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
    this.setLinesNotifier(
      nodes.map((n) => n.drawnLine),
      0,
      -1,
    ).notify();
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
            await Notifier.runAll([
              await this.renderAllNotifier(),
              await source.gotoNodeNotifier(storeNode),
            ]);
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
