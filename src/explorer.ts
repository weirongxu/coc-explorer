import { HelperEventEmitter, Notifier } from 'coc-helper';
import {
  Buffer,
  Disposable,
  disposeAll,
  ExtensionContext,
  Window,
  workspace,
} from 'coc.nvim';
import pFilter from 'p-filter';
import { ActionExplorer } from './actions/actionExplorer';
import { loadGlobalActions } from './actions/globalActions';
import { MappingMode } from './actions/types';
import { argOptions, ResolvedArgs } from './arg/argOptions';
import { ArgContentWidthTypes, Args } from './arg/parseArgs';
import { ExplorerConfig, getRevealWhenOpen } from './config';
import { BuffuerContextVars } from './contextVariables';
import { doUserAutocmd, doUserAutocmdNotifier, onEvent } from './events';
import { ExplorerManager } from './explorerManager';
import { FloatingPreview } from './floating/floatingPreview';
import { quitHelp, showHelp } from './help';
import { HighlightExplorer } from './highlight/highlightExplorer';
import { LocatorExplorer } from './locator/locatorExplorer';
import { Rooter, RooterOpened } from './rooter';
import './source/load';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { sourceManager } from './source/sourceManager';
import { ExplorerOpenOptions } from './types';
import {
  closeWinByBufnrNotifier,
  currentBufnr,
  logger,
  normalizePath,
  sum,
  winByWinid,
  winidByWinnr,
  winnrByBufnr,
} from './util';
import { RendererExplorer } from './view/rendererExplorer';
import { ViewExplorer } from './view/viewExplorer';

export class Explorer implements Disposable {
  nvim = workspace.nvim;
  context: ExtensionContext;
  inited: BuffuerContextVars<boolean>;
  sourceWinid: BuffuerContextVars<number>;
  sourceBufnr: BuffuerContextVars<number>;
  buffer: Buffer;
  floatingPreview: FloatingPreview;
  contentWidth = 0;
  action = new ActionExplorer(this);
  highlight = new HighlightExplorer(this);
  view = new ViewExplorer(this);
  locator = new LocatorExplorer(this);
  events = new HelperEventEmitter<{
    'open-pre': () => void | Promise<void>;
    'first-open-pre': () => void | Promise<void>;
    'open-post': () => void | Promise<void>;
    'first-open-post': () => void | Promise<void>;
  }>(logger);
  firstOpened = false;
  rooter?: RooterOpened;

  private disposables: Disposable[] = [];
  private root_?: string;
  private args_?: Args;
  private argValues_?: ResolvedArgs;
  private isFloating_?: boolean;
  private sources_?: ExplorerSource<any>[];
  private prevArgSourcesEnabledJson?: string;
  private isHide = false;

  private static async genExplorerPosition(args: ResolvedArgs) {
    let width: number = 0;
    let height: number = 0;
    let left: number = 0;
    let top: number = 0;

    if (args.position.name !== 'floating') {
      width = args.width;
    } else {
      width = args.floatingWidth;
      height = args.floatingHeight;
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
      const floatingPosition = args.floatingPosition;
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
    argValues: ResolvedArgs,
    config: ExplorerConfig,
  ) {
    explorerManager.maxExplorerID += 1;

    const { width, height, top, left } = await this.genExplorerPosition(
      argValues,
    );
    const [bufnr, borderBufnr]: [
      number,
      number | undefined,
    ] = await workspace.nvim.call('coc_explorer#open_explorer', [
      explorerManager.maxExplorerID,
      argValues.position,
      {
        width,
        height,
        left,
        top,
        focus: argValues.focus,
        border_enable: config.get('floating.border.enable'),
        border_chars: config.get('floating.border.chars'),
        title: config.get('floating.border.title'),
      } as ExplorerOpenOptions,
    ]);

    const explorer = new Explorer(
      explorerManager.maxExplorerID,
      explorerManager,
      bufnr,
      borderBufnr,
      config,
    );

    await explorer.inited.set(true);
    return explorer;
  }

  constructor(
    public explorerID: number,
    public explorerManager: ExplorerManager,
    public bufnr: number,
    public borderBufnr: number | undefined,
    public config: ExplorerConfig,
  ) {
    this.context = explorerManager.context;
    this.buffer = this.nvim.createBuffer(this.bufnr);
    this.inited = new BuffuerContextVars<boolean>('inited', this.buffer);
    this.sourceWinid = new BuffuerContextVars<number>(
      'sourceWinid',
      this.buffer,
    );
    this.sourceBufnr = new BuffuerContextVars<number>(
      'sourceBufnr',
      this.buffer,
    );
    this.floatingPreview = new FloatingPreview(this);

    if (borderBufnr) {
      this.disposables.push(
        onEvent('BufWinLeave', async (curBufnr) => {
          if (curBufnr === bufnr) {
            await closeWinByBufnrNotifier([borderBufnr]).run();
          }
        }),
      );
    }

    loadGlobalActions(this.action);
  }

  dispose() {
    this.floatingPreview.dispose();
    this.disposables.forEach((s) => s.dispose());
  }

  get root(): string {
    if (!this.root_) {
      throw Error('Explorer root not initialized yet');
    }
    return this.root_;
  }

  get args(): Args {
    if (!this.args_) {
      throw Error('Explorer args not initialized yet');
    }
    return this.args_;
  }

  get argValues(): ResolvedArgs {
    if (!this.argValues_) {
      throw Error('Explorer argValues not initialized yet');
    }
    return this.argValues_;
  }

  get isFloating(): boolean {
    if (this.isFloating_ === undefined) {
      throw Error('Explorer isFloating not initialized yet');
    }
    return this.isFloating_;
  }

  get sources(): ExplorerSource<BaseTreeNode<any>>[] {
    if (!this.sources_) {
      throw Error('Explorer sources not initialized yet');
    }
    return this.sources_;
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

  get borderWin(): Promise<Window | undefined> {
    return this.borderWinid.then(winByWinid);
  }

  get borderWinnr() {
    return winnrByBufnr(this.borderBufnr);
  }

  get borderWinid() {
    return this.borderWinnr.then(winidByWinnr);
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

  async sourceBuffer() {
    const bufnr = await this.sourceBufnr.get();
    if (!bufnr) {
      return;
    }
    return this.nvim.createBuffer(bufnr);
  }

  visible() {
    const node = this.explorerManager.bufManager.getBufferNode(this.bufnr);
    return node?.visible;
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
          contentBaseWidth = await window.width;
          if (
            ((await window.getOption('relativenumber')) as boolean) ||
            ((await window.getOption('number')) as boolean)
          ) {
            contentBaseWidth -= (await window.getOption(
              'numberwidth',
            )) as number;
          }
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

    if (this.isFloating) {
      if (await setWidth('win-width', this.argValues.floatingContentWidth)) {
        return;
      }
    }

    if (
      await setWidth(
        this.argValues.contentWidthType,
        this.argValues.contentWidth,
      )
    ) {
      return;
    }
  }

  async resize() {
    const { width, height, top, left } = await Explorer.genExplorerPosition(
      this.argValues,
    );
    await this.nvim.call('coc_explorer#resize', [
      this.bufnr,
      this.argValues.position,
      {
        width,
        height,
        left,
        top,
        border_bufnr: this.borderBufnr,
        border_enable: this.config.get('floating.border.enable'),
        border_chars: this.config.get('floating.border.chars'),
        title: this.config.get('floating.border.title'),
      } as ExplorerOpenOptions,
    ]);
  }

  /**
   * Focus on explorer window
   * @returns Whether the focus is successful
   */
  async focus() {
    const win = await this.win;
    if (win) {
      // focus on explorer window
      await this.nvim.command(`${await win.number}wincmd w`);
      await this.resize();
      return true;
    }
    return false;
  }

  async resume(args: ResolvedArgs) {
    const { width, height, top, left } = await Explorer.genExplorerPosition(
      args,
    );
    await this.nvim.call('coc_explorer#resume', [
      this.bufnr,
      args.position,
      {
        width,
        height,
        left,
        top,
        focus: args.focus,
        border_bufnr: this.borderBufnr,
        border_enable: this.config.get('floating.border.enable'),
        border_chars: this.config.get('floating.border.chars'),
        title: this.config.get('floating.border.title'),
      } as ExplorerOpenOptions,
    ]);
  }

  async open(args: Args, rooter: Rooter, isFirst: boolean) {
    let firstOpen: boolean;
    if (!this.firstOpened) {
      firstOpen = true;
      this.firstOpened = true;
    } else {
      firstOpen = false;
    }
    if (firstOpen) {
      await this.events.fire('first-open-pre');
    }
    await this.events.fire('open-pre');
    await doUserAutocmd('CocExplorerOpenPre');

    this.rooter = rooter.open(this);

    if (this.view.isHelpUI) {
      await this.quitHelp();
    }

    await this.highlight.bootSyntax();

    const sourcesChanged = await this.initArgs(args, this.rooter);

    for (const source of this.sources) {
      await source.bootOpen(isFirst);
    }

    await this.view.sync(async (r) => {
      const notifiers: Notifier[] = [];
      if (sourcesChanged) {
        notifiers.push(this.clearLinesNotifier());
      }
      notifiers.push(
        await this.loadAllNotifier(r),
        ...(await Promise.all(
          r
            .rendererSources()
            .map((rs) => rs.source.openedNotifier(rs, isFirst)),
        )),
      );
      await Notifier.runAll(notifiers);

      await doUserAutocmd('CocExplorerOpenPost');
      await this.events.fire('open-post');
      if (firstOpen) {
        await this.events.fire('first-open-post');
      }
    });
  }

  async tryQuitOnOpenNotifier() {
    if (this.argValues.quitOnOpen || this.isFloating) {
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
      await this.resume(this.argValues);
    }
  }

  async quitNotifier(isHide = false) {
    if (!isHide) {
      await doUserAutocmd('CocExplorerQuitPre');
    }
    const sourceWinnr = await this.sourceWinnr();
    const bufnr = await currentBufnr();
    return Notifier.create(() => {
      if (sourceWinnr && this.bufnr === bufnr) {
        this.nvim.command(`${sourceWinnr}wincmd w`, true);
      }
      closeWinByBufnrNotifier([this.bufnr]).notify();
      if (!isHide) {
        doUserAutocmdNotifier('CocExplorerQuitPost').notify();
      }
    });
  }

  async quit(isHide = false) {
    return Notifier.run(await this.quitNotifier(isHide));
  }

  /**
   * initialize root
   */
  private async initRoot(argValues: ResolvedArgs, rooter: RooterOpened) {
    const root = argValues.rootUri;
    if (root) {
      this.root_ = normalizePath(root);
      return;
    }

    let reveal: string | undefined;
    if (getRevealWhenOpen(this.config)) {
      reveal = await this.revealPath();
    }
    const resolvedRoot = await rooter.resolveRoot(
      reveal,
      this.argValues.rootStrategies,
    );
    if (resolvedRoot) {
      this.root_ = normalizePath(resolvedRoot);
      return;
    }

    this.root_ = normalizePath(workspace.cwd);
  }

  /**
   * initialize arguments
   *
   * @return sources changed
   */
  private async initArgs(args: Args, rooter: RooterOpened): Promise<boolean> {
    this.args_ = args;
    this.argValues_ = await args.values(argOptions);
    await this.initRoot(this.argValues_, rooter);

    const argSources = await args.value(argOptions.sources);
    if (!argSources) {
      return false;
    }

    const enabledArgSources = await pFilter(argSources, (s) =>
      sourceManager.enabled(s.name),
    );
    const argSourcesEnabledJson = JSON.stringify(enabledArgSources);
    if (
      this.prevArgSourcesEnabledJson &&
      this.prevArgSourcesEnabledJson === argSourcesEnabledJson
    ) {
      return false;
    }
    this.prevArgSourcesEnabledJson = argSourcesEnabledJson;

    disposeAll(this.sources_ ?? []);

    this.sources_ = enabledArgSources.map((sourceArg) =>
      sourceManager.createSource(sourceArg.name, this, sourceArg.expand),
    );

    const position = await this.args_.value(argOptions.position);
    this.isFloating_ = position.name === 'floating';

    return true;
  }

  async revealPath() {
    const revealPath = await this.args.value(argOptions.reveal);
    if (revealPath) {
      return revealPath;
    } else {
      const buf = await this.sourceBuffer();
      if (buf) {
        return (
          this.explorerManager.bufManager.getBufferNode(buf.id)?.fullpath ??
          undefined
        );
      }
      return;
    }
  }

  async getSelectedOrCursorLineIndexes(mode: MappingMode) {
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
    await this.view.refreshLineIndex();
    lineIndexes.add(this.view.currentLineIndex);
    return lineIndexes;
  }

  findSourceByLineIndex(
    lineIndex: number,
  ): { source: ExplorerSource<any>; sourceIndex: number } {
    const sourceIndex = this.sources.findIndex(
      (source) => lineIndex < source.view.endLineIndex,
    );
    if (sourceIndex === -1) {
      const index = this.sources.length - 1;
      return { source: this.sources[index], sourceIndex: index };
    } else {
      return { source: this.sources[sourceIndex], sourceIndex };
    }
  }

  lineIndexesGroupBySource(lineIndexes: number[] | Set<number>) {
    const groups: Record<
      number,
      {
        source: ExplorerSource<any>;
        lineIndexes: number[];
      }
    > = {};
    for (const line of lineIndexes) {
      const { source, sourceIndex } = this.findSourceByLineIndex(line);
      if (!(sourceIndex in groups)) {
        groups[sourceIndex] = {
          source,
          lineIndexes: [line],
        };
      }
      groups[sourceIndex].lineIndexes.push(line);
    }
    return Object.values(groups);
  }

  setLinesNotifier(lines: string[], start: number, end: number) {
    return Notifier.create(() => {
      this.nvim.call(
        'coc_explorer#util#buf_set_lines_skip_cursor',
        [this.bufnr, start, end, false, lines],
        true,
      );
    });
  }

  clearLinesNotifier() {
    return this.setLinesNotifier([], 0, -1);
  }

  async loadAllNotifier(renderer: RendererExplorer, { render = true } = {}) {
    this.locator.mark.removeAll();
    const notifiers = await Promise.all(
      renderer
        .rendererSources()
        .map((r) =>
          r.source.loadNotifier(r, r.view.rootNode, { render: false }),
        ),
    );
    if (render) {
      notifiers.push(await renderer.renderAllNotifier());
    }
    return Notifier.combine(notifiers);
  }

  async showHelp(source: ExplorerSource<any>) {
    return showHelp(this, source);
  }

  async quitHelp() {
    return quitHelp(this);
  }
}
