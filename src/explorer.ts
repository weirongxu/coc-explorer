import { Notifier } from 'coc-helper';
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
import { argOptions } from './arg/argOptions';
import { ExplorerConfig } from './config';
import { BuffuerContextVars } from './contextVariables';
import { doUserAutocmd, doUserAutocmdNotifier, onEvent } from './events';
import { ExplorerManager } from './explorerManager';
import { FloatingPreview } from './floating/floatingPreview';
import { quitHelp, showHelp } from './help';
import { HighlightExplorer } from './highlight/highlightExplorer';
import { LocatorExplorer } from './locator/locatorExplorer';
import { ArgContentWidthTypes, Args } from './arg/parseArgs';
import './source/load';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { sourceManager } from './source/sourceManager';
import { ExplorerOpenOptions } from './types';
import {
  closeWinByBufnrNotifier,
  currentBufnr,
  normalizePath,
  sum,
  winByWinid,
  winidByWinnr,
  winnrByBufnr,
} from './util';
import { ViewExplorer } from './view/viewExplorer';

export class Explorer implements Disposable {
  nvim = workspace.nvim;
  inited = new BuffuerContextVars<boolean>('inited', this);
  sourceWinid = new BuffuerContextVars<number>('sourceWinid', this);
  sourceBufnr = new BuffuerContextVars<number>('sourceBufnr', this);
  context: ExtensionContext;
  floatingPreview: FloatingPreview;
  contentWidth = 0;
  action = new ActionExplorer(this);
  highlight = new HighlightExplorer(this);
  view = new ViewExplorer(this);
  locator = new LocatorExplorer(this);

  private disposables: Disposable[] = [];
  private _buffer?: Buffer;
  private _rootUri?: string;
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
    const focus = await args.value(argOptions.focus);
    const { width, height, top, left } = await this.genExplorerPosition(args);
    const [bufnr, borderBufnr]: [
      number,
      number | undefined,
    ] = await workspace.nvim.call('coc_explorer#open_explorer', [
      explorerManager.maxExplorerID,
      position,
      {
        width,
        height,
        left,
        top,
        focus,
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

  get rootUri(): string {
    if (!this._rootUri) {
      throw Error('Explorer rootUri not initialized yet');
    }
    return this._rootUri;
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

  async resize() {
    const position = await this.args.value(argOptions.position);
    const { width, height, top, left } = await Explorer.genExplorerPosition(
      this.args,
    );
    await this.nvim.call('coc_explorer#resize', [
      this.bufnr,
      position,
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

  async resume(args: Args) {
    const position = await args.value(argOptions.position);
    const focus = await args.value(argOptions.focus);
    const { width, height, top, left } = await Explorer.genExplorerPosition(
      args,
    );
    await this.nvim.call('coc_explorer#resume', [
      this.bufnr,
      position,
      {
        width,
        height,
        left,
        top,
        focus,
        border_bufnr: this.borderBufnr,
        border_enable: this.config.get('floating.border.enable'),
        border_chars: this.config.get('floating.border.chars'),
        title: this.config.get('floating.border.title'),
      } as ExplorerOpenOptions,
    ]);
  }

  async open(args: Args, rootPath: string, isFirst: boolean) {
    await doUserAutocmd('CocExplorerOpenPre');

    if (this.view.isHelpUI) {
      await this.quitHelp();
    }

    await this.highlight.addSyntax();

    const sourcesChanged = await this.initArgs(args, rootPath);

    for (const source of this.sources) {
      await source.bootOpen(isFirst);
    }

    const notifiers: Notifier[] = [];
    if (sourcesChanged) {
      notifiers.push(this.clearLinesNotifier());
    }
    notifiers.push(
      await this.loadAllNotifier(),
      ...(await Promise.all(
        this.sources.map((s) => s.openedNotifier(isFirst)),
      )),
    );
    await Notifier.runAll(notifiers);

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
   * initialize rootUri
   */
  private async initRootUri(args: Args, rootPath: string) {
    const rootUri = await args.value(argOptions.rootUri);
    if (rootUri) {
      this._rootUri = normalizePath(rootUri);
      return;
    }
    const buf = await this.sourceBuffer();
    if (!buf) {
      this._rootUri = normalizePath(workspace.cwd);
      return;
    }
    const buftype = await buf.getVar('&buftype');
    if (buftype === 'nofile') {
      this._rootUri = normalizePath(workspace.cwd);
      return;
    }
    const fullpath = this.explorerManager.bufManager.getBufferNode(buf.id)
      ?.fullpath;
    if (!fullpath) {
      this._rootUri = normalizePath(workspace.cwd);
      return;
    }
    this._rootUri = normalizePath(rootPath);
  }

  /**
   * initialize arguments
   *
   * @return sources changed
   */
  private async initArgs(args: Args, rootPath: string): Promise<boolean> {
    this._args = args;
    await this.initRootUri(args, rootPath);
    this.explorerManager.rootPathRecords.add(this.rootUri);

    const argSources = await args.value(argOptions.sources);
    if (!argSources) {
      return false;
    }

    const argSourcesEnabled = await pFilter(argSources, (s) =>
      sourceManager.enabled(s.name),
    );
    const argSourcesEnabledJson = JSON.stringify(argSourcesEnabled);
    if (
      this.lastArgSourcesEnabledJson &&
      this.lastArgSourcesEnabledJson === argSourcesEnabledJson
    ) {
      return false;
    }
    this.lastArgSourcesEnabledJson = argSourcesEnabledJson;

    disposeAll(this._sources ?? []);

    this._sources = argSourcesEnabled.map((sourceArg) =>
      sourceManager.createSource(sourceArg.name, this, sourceArg.expand),
    );

    return true;
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

  async loadAllNotifier({ render = true } = {}) {
    this.locator.mark.removeAll();
    const notifiers = await Promise.all(
      this.sources.map((source) =>
        source.loadNotifier(source.view.rootNode, { render: false }),
      ),
    );
    if (render) {
      notifiers.push(await this.renderAllNotifier());
    }
    return Notifier.combine(notifiers);
  }

  async renderAllNotifier() {
    const notifiers = await Promise.all(
      this.sources.map((s) => s.view.renderNotifier({ force: true })),
    );

    return Notifier.combine(notifiers);
  }

  async showHelp(source: ExplorerSource<any>) {
    return showHelp(this, source);
  }

  async quitHelp() {
    return quitHelp(this);
  }
}
