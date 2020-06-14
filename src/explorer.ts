import {
  Buffer,
  Disposable,
  ExtensionContext,
  Window,
  workspace,
} from 'coc.nvim';
import pFilter from 'p-filter';
import { conditionActionRules } from './actions/condition';
import { ActionExp } from './actions/mapping';
import { RegisteredAction } from './actions/registered';
import { argOptions } from './argOptions';
import { ExplorerConfig, getEnableDebug } from './config';
import { BuffuerContextVars } from './contextVariables';
import {
  doUserAutocmd,
  doUserAutocmdNotifier,
  onBufEnter,
  onCursorMoved,
  onEvent,
} from './events';
import { ExplorerManager } from './explorerManager';
import { FloatingPreview } from './floating/floatingPreview';
import { quitHelp, showHelp } from './help';
import { IndexingManager } from './indexingManager';
import { MappingMode } from './mappings';
import { ArgContentWidthTypes, Args } from './parseArgs';
import {
  HighlightPositionWithLine,
  hlGroupManager,
} from './source/highlightManager';
import './source/load';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { sourceManager } from './source/sourceManager';
import {
  MoveStrategy,
  moveStrategyList,
  PreviewStrategy,
  previewStrategyList,
} from './types';
import {
  closeWinByBufnrNotifier,
  enableWrapscan,
  flatten,
  Notifier,
  partition,
  queueAsyncFunction,
  scanIndexNext,
  scanIndexPrev,
  sum,
  winByWinid,
  winidByWinnr,
  winnrByBufnr,
} from './util';

export class Explorer implements Disposable {
  nvim = workspace.nvim;
  isHelpUI: boolean = false;
  currentLineIndex = 0;
  helpHlSrcId = workspace.createNameSpace('coc-explorer-help');
  indexingManager = new IndexingManager(this);
  inited = new BuffuerContextVars<boolean>('inited', this);
  sourceWinid = new BuffuerContextVars<number>('sourceWinid', this);
  globalActions: RegisteredAction.Map<BaseTreeNode<any>> = {};
  context: ExtensionContext;
  floatingWindow: FloatingPreview;
  contentWidth = 0;

  private disposables: Disposable[] = [];
  private _buffer?: Buffer;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private lastArgSourcesEnabledJson?: string;
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
      } else if (floatingPosition === 'center-top') {
        left = (vimWidth - width) / 2;
        top = 0;
      } else {
        [left, top] = floatingPosition;
      }
    }
    return { width, height, top, left };
  }

  static async create(
    explorerManager: ExplorerManager,
    args: Args,
    config: ExplorerConfig,
  ) {
    explorerManager.maxExplorerID += 1;

    const position = await args.value(argOptions.position);
    const { width, height, top, left } = await this.genExplorerPosition(args);
    const [bufnr, floatingBorderBufnr]: [
      number,
      number | undefined,
    ] = await workspace.nvim.call('coc_explorer#create', [
      explorerManager.bufferName,
      explorerManager.maxExplorerID,
      position,
      width,
      height,
      left,
      top,
      config.get('floating.border.enable'),
      config.get('floating.border.chars'),
      config.get('floating.border.title'),
    ]);

    const explorer = new Explorer(
      explorerManager.maxExplorerID,
      explorerManager,
      bufnr,
      floatingBorderBufnr,
      config,
    );

    await explorer.inited.set(true);
    return explorer;
  }

  constructor(
    public explorerID: number,
    public explorerManager: ExplorerManager,
    public bufnr: number,
    public floatingBorderBufnr: number | undefined,
    public config: ExplorerConfig,
  ) {
    this.context = explorerManager.context;
    this.floatingWindow = new FloatingPreview(this);

    if (this.config.get('previewAction.onHover')) {
      this.disposables.push(
        onCursorMoved(async (bufnr) => {
          if (bufnr === this.bufnr) {
            await this.doActionsWithCount(
              {
                name: 'preview',
                args: ['labeling', '200'],
              },
              'n',
            );
          }
        }, 200),
        onBufEnter(async (bufnr) => {
          if (bufnr === this.bufnr) {
            await this.doActionsWithCount(
              {
                name: 'preview',
                args: ['labeling', '200'],
              },
              'n',
            );
          }
        }, 200),
      );
    }

    this.disposables.push(
      onEvent('BufWinLeave', async (bufnr) => {
        if (bufnr === this.bufnr) {
          await this.quitFloatingBorderWin();
          await this.floatingWindow.floatFactory.close();
        }
      }),
    );

    const moveActionArgs = [
      {
        name: 'move action options',
        description: moveStrategyList.join(' | '),
      },
    ];
    const moveActionMenu = {
      insideSource: 'move inside current source',
    };
    this.addGlobalAction(
      'nodePrev',
      async ({ args }) => {
        const moveStrategy = args[0] as MoveStrategy;
        if (moveStrategy === 'insideSource') {
          const source = await this.currentSource();
          if (!source) {
            return;
          }
          await source.gotoLineIndex(source.currentLineIndex - 1);
        } else {
          const line = this.currentLineIndex;
          await this.gotoLineIndex(line - 1);
        }
      },
      'previous node',
      {
        args: moveActionArgs,
        menus: moveActionMenu,
      },
    );
    this.addGlobalAction(
      'nodeNext',
      async ({ args }) => {
        const moveStrategy = args[0] as MoveStrategy;
        if (moveStrategy === 'insideSource') {
          const source = await this.currentSource();
          if (!source) {
            return;
          }
          await source.gotoLineIndex(source.currentLineIndex + 1);
        } else {
          const line = this.currentLineIndex;
          await this.gotoLineIndex(line + 1);
        }
      },
      'next node',
      {
        args: moveActionArgs,
        menus: moveActionMenu,
      },
    );
    this.addGlobalAction(
      'expandablePrev',
      async ({ args }) => {
        await this.nodePrev(
          args[0] as MoveStrategy,
          (node) => !!node.expandable,
        );
      },
      'previous expandable node',
      {
        args: moveActionArgs,
        menus: moveActionMenu,
      },
    );
    this.addGlobalAction(
      'expandableNext',
      async ({ args }) => {
        await this.nodeNext(
          args[0] as MoveStrategy,
          (node) => !!node.expandable,
        );
      },
      'next expandable node',
      {
        args: moveActionArgs,
        menus: moveActionMenu,
      },
    );
    this.addGlobalAction(
      'indentPrev',
      async ({ args }) => {
        const node = await this.currentNode();
        const level = node?.level ?? 0;
        await this.nodePrev(
          args[0] as MoveStrategy,
          (node) => node.level !== level,
        );
      },
      'previous indent node',
      {
        args: moveActionArgs,
        menus: moveActionMenu,
      },
    );
    this.addGlobalAction(
      'indentNext',
      async ({ args }) => {
        const node = await this.currentNode();
        const level = node?.level ?? 0;
        await this.nodeNext(
          args[0] as MoveStrategy,
          (node) => node.level !== level,
        );
      },
      'next indent node',
      {
        args: moveActionArgs,
        menus: moveActionMenu,
      },
    );
    this.addGlobalAction(
      'normal',
      async ({ args }) => {
        if (args[0]) {
          await this.nvim.command('normal ' + args[0]);
        }
      },
      'execute vim normal mode commands',
      {
        args: [
          {
            name: 'normal commands',
          },
        ],
        menus: {
          zz: 'execute normal zz',
        },
      },
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
      async ({ nodes, args }) => {
        const source = await this.currentSource();
        if (nodes && nodes[0] && source) {
          const node = nodes[0];
          const previewStrategy =
            (args[0] as PreviewStrategy) ??
            this.config.get('previewAction.strategy');
          const debounceTimeout = args[1] ? parseInt(args[1]) : 0;
          return source.previewAction(node, previewStrategy, debounceTimeout);
        }
      },
      'preview',
      {
        args: [
          {
            name: 'preview strategy',
            description: previewStrategyList.join(' | '),
          },
        ],
        menus: ExplorerSource.prototype.previewActionMenu,
      },
    );

    this.addGlobalAction(
      'gotoSource',
      async ({ args }) => {
        const source = this.sources.find((s) => s.sourceType === args[0]);
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
      'modifiedPrev',
      async () => {
        await this.gotoPrevIndexing('modified');
      },
      'go to previous modified',
    );
    this.addGlobalAction(
      'modifiedNext',
      async () => {
        await this.gotoNextIndexing('modified');
      },
      'go to next modified',
    );

    this.addGlobalAction(
      'diagnosticPrev',
      async () => {
        await this.gotoPrevIndexing('diagnosticError', 'diagnosticWarning');
      },
      'go to previous diagnostic',
    );
    this.addGlobalAction(
      'diagnosticNext',
      async () => {
        await this.gotoNextIndexing('diagnosticError', 'diagnosticWarning');
      },
      'go to next diagnostic',
    );

    this.addGlobalAction(
      'gitPrev',
      async () => {
        await this.gotoPrevIndexing('git');
      },
      'go to previous git changed',
    );
    this.addGlobalAction(
      'gitNext',
      async () => {
        await this.gotoNextIndexing('git');
      },
      'go to next git changed',
    );
  }

  dispose() {
    this.floatingWindow.dispose();
    this.disposables.forEach((s) => s.dispose());
  }

  get args(): Args {
    if (!this._args) {
      throw Error('Explorer args not initialized yet');
    }
    return this._args;
  }

  get buffer(): Buffer {
    if (!this._buffer) {
      this._buffer = this.nvim.createBuffer(this.bufnr);
    }
    return this._buffer;
  }

  get sources(): ExplorerSource<BaseTreeNode<any>>[] {
    if (!this._sources) {
      throw Error('Explorer sources not initialized yet');
    }
    return this._sources;
  }

  get flattenedNodes() {
    return flatten(this.sources.map((s) => s.flattenedNodes));
  }

  get height() {
    return sum(this.sources.map((s) => s.height));
  }

  get win(): Promise<Window | undefined> {
    return this.winid.then(winByWinid);
  }

  /**
   * vim winnr of explorer
   */
  get winnr(): Promise<number | undefined> {
    return winnrByBufnr(this.bufnr);
  }

  /**
   * vim winid of explorer
   */
  get winid(): Promise<number | undefined> {
    return this.winnr.then(winidByWinnr);
  }

  get floatingBorderWin(): Promise<Window | undefined> {
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
      return undefined;
    }
    const winnr = (await this.nvim.call('win_id2win', [winid])) as number;
    if (winnr <= 0 || (await this.explorerManager.winnrs()).includes(winnr)) {
      return;
    }
    return winnr;
  }

  async sourceBufnrBySourceWinid() {
    const winid = await this.sourceWinid.get();
    if (!winid) {
      return;
    }
    const bufnr = (await this.nvim.call('winbufnr', [winid])) as number;
    if (bufnr <= 0) {
      return;
    }
    return bufnr;
  }

  clearHighlightsNotify(hlSrcId: number, lineStart?: number, lineEnd?: number) {
    hlGroupManager.clearHighlightsNotify(this, hlSrcId, lineStart, lineEnd);
  }

  addHighlightsNotify(
    hlSrcId: number,
    highlights: HighlightPositionWithLine[],
  ) {
    hlGroupManager.addHighlightsNotify(this, hlSrcId, highlights);
  }

  async addHighlightSyntax() {
    const winnr = await this.winnr;
    const curWinnr = await this.nvim.call('winnr');
    if (winnr) {
      this.nvim.pauseNotification();
      if (winnr !== curWinnr) {
        this.nvim.command(`${winnr}wincmd w`, true);
      }
      hlGroupManager.addHighlightSyntaxNotify();
      if (winnr !== curWinnr) {
        this.nvim.command(`${curWinnr}wincmd w`, true);
      }
      await this.nvim.resumeNotification();
    }
  }

  private async nodePrev(
    moveStrategy: MoveStrategy = 'default',
    condition: (it: BaseTreeNode<any>) => boolean,
  ) {
    const gotoPrev = async (
      nodes: BaseTreeNode<any>[],
      lineIndex: number,
      startLineIndex: number,
    ) => {
      const relativeIndex = scanIndexPrev(
        nodes,
        lineIndex,
        await enableWrapscan(),
        condition,
      );
      if (relativeIndex === undefined) {
        return;
      }
      await this.gotoLineIndex(startLineIndex + relativeIndex);
    };

    if (moveStrategy === 'insideSource') {
      const source = await this.currentSource();
      if (!source) {
        return;
      }
      await gotoPrev(
        source.flattenedNodes,
        source.currentLineIndex,
        source.startLineIndex,
      );
    } else {
      await gotoPrev(this.flattenedNodes, this.currentLineIndex, 0);
    }
  }

  private async nodeNext(
    moveStrategy: MoveStrategy = 'default',
    condition: (it: BaseTreeNode<any>) => boolean,
  ) {
    const gotoNext = async (
      nodes: BaseTreeNode<any>[],
      lineIndex: number,
      startLineIndex: number,
    ) => {
      const relativeIndex = scanIndexNext(
        nodes,
        lineIndex,
        await enableWrapscan(),
        condition,
      );
      if (relativeIndex === undefined) {
        return;
      }
      await this.gotoLineIndex(startLineIndex + relativeIndex);
    };

    if (moveStrategy === 'insideSource') {
      const source = await this.currentSource();
      if (!source) {
        return;
      }
      await gotoNext(
        source.flattenedNodes,
        source.currentLineIndex,
        source.startLineIndex,
      );
    } else {
      await gotoNext(this.flattenedNodes, this.currentLineIndex, 0);
    }
  }

  async refreshLineIndex() {
    const win = await this.win;
    if (win) {
      const cursor = await win.cursor;
      this.currentLineIndex = cursor[0] - 1;
    }
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
        this.config.get('floating.border.enable'),
        this.config.get('floating.border.chars'),
        this.config.get('floating.border.title'),
      ]);
    }
  }

  async open(args: Args, isFirst: boolean) {
    await doUserAutocmd('CocExplorerOpenPre');

    if (this.isHelpUI) {
      await this.quitHelp();
    }

    await this.addHighlightSyntax();

    await this.initArgs(args);

    for (const source of this.sources) {
      await source.bootOpen(isFirst);
    }

    await Notifier.runAll([
      await this.reloadAllNotifier(),
      ...(await Promise.all(
        this.sources.map((s) => s.openedNotifier(isFirst)),
      )),
    ]);

    await doUserAutocmd('CocExplorerOpenPost');
  }

  async tryQuitOnOpenNotifier() {
    const quitonOpen = await this.args.value(argOptions.quitOnOpen);
    if (
      quitonOpen ||
      (await this.args.value(argOptions.position)) === 'floating'
    ) {
      return this.quitNotifier();
    }
    return Notifier.noop();
  }

  async tryQuitOnOpen() {
    return Notifier.run(this.tryQuitOnOpenNotifier());
  }

  async hide() {
    this.isHide = true;
    await this.quit(true);
  }

  async show() {
    if (this.isHide) {
      this.isHide = false;
      await this.resume(this.args);
    }
  }

  async quitNotifier(isHide = false) {
    if (!isHide) {
      await doUserAutocmd('CocExplorerQuitPre');
    }
    const sourceWinnr = await this.sourceWinnr();
    return Notifier.create(() => {
      if (sourceWinnr && this.bufnr === workspace.bufnr) {
        this.nvim.command(`${sourceWinnr}wincmd w`, true);
      }
      closeWinByBufnrNotifier(this.bufnr).notify();
      if (!isHide) {
        doUserAutocmdNotifier('CocExplorerQuitPost').notify();
      }
    });
  }

  async quit(isHide = false) {
    return Notifier.run(await this.quitNotifier(isHide));
  }

  async quitFloatingBorderWin() {
    if (this.floatingBorderBufnr) {
      await closeWinByBufnrNotifier(this.floatingBorderBufnr).run();
    }
  }

  private async initArgs(args: Args) {
    this._args = args;
    this.explorerManager.rootPathRecords.add(
      await this.args.value(argOptions.rootUri),
    );

    const argSources = await args.value(argOptions.sources);
    if (!argSources) {
      return;
    }

    const argSourcesEnabled = await pFilter(argSources, (s) =>
      sourceManager.enabled(s.name),
    );
    const argSourcesEnabledJson = JSON.stringify(argSourcesEnabled);
    if (
      this.lastArgSourcesEnabledJson &&
      this.lastArgSourcesEnabledJson === argSourcesEnabledJson
    ) {
      return;
    }

    this._sources?.forEach((s) => s.dispose());

    this._sources = argSourcesEnabled.map((sourceArg) =>
      sourceManager.createSource(sourceArg.name, this, sourceArg.expand),
    );
  }

  addGlobalAction(
    name: string,
    callback: (options: {
      nodes: BaseTreeNode<any>[];
      args: string[];
      mode: MappingMode;
    }) => void | Promise<void>,
    description: string,
    options: Partial<RegisteredAction.Options> = {},
  ) {
    this.globalActions[name] = {
      callback,
      description,
      options,
    };
  }

  async getSelectedLineIndexes(mode: MappingMode) {
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
    actionExp: ActionExp,
    mode: MappingMode,
    count?: number,
    lineIndexes?: number[] | Set<number> | undefined,
  ) => Promise<void>;
  async doActionsWithCount(
    actionExp: ActionExp,
    mode: MappingMode,
    count: number = 1,
    lineIndexes: number[] | Set<number> | undefined = undefined,
  ) {
    if (!this._doActionsWithCount) {
      this._doActionsWithCount = queueAsyncFunction(
        async (
          actionExp: ActionExp,
          mode: MappingMode,
          count: number = 1,
          lineIndexes: number[] | Set<number> | undefined = undefined,
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
            await this.doActionExp(selectedLineIndexes, actionExp, mode);
          }
          const notifiers = await Promise.all(
            this.sources.map((source) =>
              source.emitRequestRenderNodesNotifier(),
            ),
          );
          await Notifier.runAll(notifiers);

          if (getEnableDebug()) {
            const actionDisplay = (actionExp: ActionExp): string =>
              Array.isArray(actionExp)
                ? '[' + actionExp.map(actionDisplay).join(',') + ']'
                : [actionExp.name, ...actionExp.args].join(':');
            // eslint-disable-next-line no-restricted-properties
            workspace.showMessage(
              `action(${actionDisplay(actionExp)}): ${Date.now() - now}ms`,
              'more',
            );
          }
        },
      );
    }
    return this._doActionsWithCount(actionExp, mode, count, lineIndexes);
  }

  async doActionExp(
    selectedLineIndexes: Set<number>,
    actionExp: ActionExp,
    mode: MappingMode,
  ) {
    await this.refreshLineIndex();
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
      async function doActionExp(
        actionExp: ActionExp,
        nodes: BaseTreeNode<any>[],
      ) {
        if (Array.isArray(actionExp)) {
          for (let i = 0; i < actionExp.length; i++) {
            const action = actionExp[i];
            if (Array.isArray(action)) {
              await doActionExp(actionExp, nodes);
            } else {
              const rule = conditionActionRules[action.name];
              if (rule) {
                const [trueNodes, falseNodes] = partition(nodes, (node) =>
                  rule.filter(source, node, action.args),
                );
                const [trueAction, falseAction] = [
                  actionExp[i + 1],
                  actionExp[i + 2],
                ];
                i += 2;
                if (trueNodes.length) {
                  await doActionExp(trueAction, trueNodes);
                }
                if (falseNodes.length) {
                  await doActionExp(falseAction, falseNodes);
                }
              } else {
                await doActionExp(action, nodes);
              }
            }
          }
        } else {
          await source.doAction(actionExp.name, nodes, actionExp.args, mode);
        }
      }
      await doActionExp(actionExp, nodes);
    }
  }

  addIndexing(name: string, lineIndex: number) {
    this.indexingManager.addLine(name, lineIndex);
  }

  removeIndexing(name: string, lineIndex: number) {
    this.indexingManager.removeLine(name, lineIndex);
  }

  async gotoPrevIndexing(...names: string[]) {
    const lineIndex = await this.indexingManager.prevLineIndex(...names);
    if (lineIndex) {
      await this.gotoLineIndex(lineIndex);
      return true;
    }
    return false;
  }

  async gotoNextIndexing(...names: string[]) {
    const lineIndex = await this.indexingManager.nextLineIndex(...names);
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
    const lineIndex = this.currentLineIndex;
    return this.sources.findIndex(
      (source) =>
        lineIndex >= source.startLineIndex && lineIndex < source.endLineIndex,
    );
  }

  async currentNode() {
    const source = await this.currentSource();
    if (source) {
      const nodeIndex = this.currentLineIndex - source.startLineIndex;
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
        const height = this.height;
        if (lineIndex < 0) {
          lineIndex = 0;
        } else if (lineIndex >= height) {
          lineIndex = height - 1;
        }
        this.currentLineIndex = lineIndex;
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
      this.buffer.setOption('readonly', false, true);

      if (workspace.isVim) {
        void this.buffer.setLines(
          lines,
          {
            start,
            end,
            strictIndexing: false,
          },
          true,
        );
      } else if (workspace.isNvim) {
        this.nvim.call(
          'coc_explorer#buf_set_lines',
          [this.bufnr, start, end, false, lines],
          true,
        );
      }

      this.buffer.setOption('readonly', true, true);
      this.buffer.setOption('modifiable', false, true);
    });
  }

  async reloadAllNotifier({ render = true } = {}) {
    this.indexingManager.removeAll();
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
    const filterOption = this.config.get<{
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
    return showHelp(this, source);
  }

  async quitHelp() {
    return quitHelp(this);
  }
}
