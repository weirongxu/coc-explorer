import { ExtensionContext, workspace, Disposable, Window, events, Buffer } from 'coc.nvim';
import { Args, parseArgs, ArgPosition } from './parse-args';
import './source/load';
import { ExplorerSource, BaseItem } from './source';
import { sourceManager } from './source/source-manager';
import { mappings, Action } from './mappings';
import { onError } from './logger';

export class Explorer {
  // id for matchaddpos
  static colorId = 10800;

  name = 'coc-explorer';
  position: ArgPosition = 'left';
  nvim = workspace.nvim;
  previousBufnr?: number;
  revealFilepath?: string;
  cursorLineIndex: number = 0;
  cursorCol: number = 0;

  private _buffer?: Buffer;
  private _bufnr?: number;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private lastArgStrings?: string[];

  constructor(public context: ExtensionContext) {
    const { subscriptions } = context;

    subscriptions.push(
      events.on('BufWinLeave', (bufnr) => {
        if (bufnr !== this._bufnr) {
          this.previousBufnr = bufnr;
        }
      }),
      events.on('CursorMoved', (bufnr, cursor) => {
        if (bufnr === this._bufnr) {
          const [line, col] = cursor;
          this.cursorLineIndex = line - 1;
          this.cursorCol = col;
        }
      }),
    );
  }

  get args(): Args {
    if (!this._args) {
      throw Error('Explorer args not initialized yet');
    }
    return this._args;
  }

  get sources(): ExplorerSource<any>[] {
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

  get bufnr(): number {
    if (!this._bufnr) {
      throw Error('Explorer bufnr not initialized yet');
    }
    return this._bufnr;
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

  async open(argStrings: string[]) {
    const { nvim } = this;

    await this.initArgs(argStrings);
    this.revealFilepath = this.args.revealPath || (await nvim.call('expand', '%:p'));

    const [bufnr, inited] = (await nvim.call('coc_explorer#create', [
      this._bufnr,
      this.args.position,
      this.args.width,
      this.args.toggle,
      this.name,
    ])) as [number, boolean];

    if (bufnr === -1) {
      return;
    }

    this._bufnr = bufnr;

    await this.reloadAll();

    if (!inited) {
      await this.initMappings();
    }

    for (const source of this.sources) {
      await source.opened();
    }
  }

  private async initArgs(argStrings: string[]) {
    if (!this.lastArgStrings || this.lastArgStrings.toString() !== argStrings.toString()) {
      this.lastArgStrings = argStrings;
      this._args = await parseArgs(...argStrings);
      this._sources = this.args.sources
        .map((sourceArg) => {
          if (sourceManager.registeredSources[sourceArg.name]) {
            const source = sourceManager.registeredSources[sourceArg.name];
            source.bindExplorer(this, sourceArg.expand);
            return source;
          } else {
            workspace.showMessage(`explorer source(${sourceArg.name}) not found`, 'error');
            return null;
          }
        })
        .filter((source): source is ExplorerSource<any> => source !== null);
    }
  }

  async quit() {
    await this.nvim.command('quit');
  }

  private _mappingsDisposable: Disposable[] = [];
  async clearMappings() {
    this._mappingsDisposable.forEach((d) => d.dispose());
    this._mappingsDisposable = [];
  }
  async initMappings() {
    Object.entries(mappings).forEach(([key, actions]) => {
      (['n', 'v'] as ('n' | 'v')[]).forEach((mode) => {
        this._mappingsDisposable.push(
          // @ts-ignore FIXME upgrade to latest coc.nvim
          workspace.registerLocalKeymap(mode, key, () => {
            this.doActions(actions, mode).catch(onError);
          }),
        );
      });
    });
  }

  async doActions(actions: Action[], mode: 'n' | 'v' = 'n') {
    for (const action of actions) {
      await this.doAction(action, mode);
    }
  }

  async doAction(action: Action, mode: 'n' | 'v' = 'n') {
    const { nvim } = this;

    const lineIndexs = [];
    const document = await workspace.document;
    if (mode === 'v') {
      const range = await workspace.getSelectedRange(
        'v',
        // @ts-ignore FIXME upgrade to latest coc.nvim
        document,
      );
      for (let line = range.start.line; line <= range.end.line; line++) {
        lineIndexs.push(line);
      }
    } else {
      const line = ((await nvim.call('line', '.')) as number) - 1;
      lineIndexs.push(line);
    }

    const itemsGroup: Map<ExplorerSource<any>, Set<object | null>> = new Map();

    for (const lineIndex of lineIndexs) {
      const source = this.findSource(lineIndex);
      if (source) {
        if (!itemsGroup.has(source)) {
          itemsGroup.set(source, new Set());
        }
        const relativeLineIndex = lineIndex - source.startLine;

        const [, item] = source.lines[relativeLineIndex];
        itemsGroup.get(source)!.add(item);
      }
    }

    await Promise.all(
      Array.from(itemsGroup.entries()).map(async ([source, items]) => {
        if (items.has(null)) {
          await source.doRootAction(action.name, action.arg);
        } else {
          await source.doAction(action.name, Array.from(items).filter((item) => item), action.arg);
        }
      }),
    );
  }

  private findSource(lineIndex: number) {
    return this.sources.find((source) => lineIndex < source.endLine);
  }

  private findSourceIndex(lineIndex: number) {
    return this.sources.findIndex((source) => lineIndex < source.endLine);
  }

  /**
   * current cursor
   */
  async currentCursor() {
    const win = await this.win;
    if (win) {
      const [line, col] = await win.cursor;
      const lineIndex = line - 1;
      return {
        lineIndex,
        col: workspace.env.isVim ? col : col + 1,
      };
    }
    return null;
  }

  async storeCursor<Item extends BaseItem<Item>>() {
    const storeCursor = await this.currentCursor();
    const storeView = await this.nvim.call('winsaveview');
    if (storeCursor) {
      const sourceIndex = this.findSourceIndex(storeCursor.lineIndex);
      const source = this.sources[sourceIndex];
      if (source) {
        const storeItem: null | Item = await source.getItemByIndex(storeCursor.lineIndex - source.startLine);
        return async () => {
          await this.nvim.call('winrestview', storeView);
          await source.gotoItem(storeItem, storeCursor.col);
        };
      }
    }
    return async () => {
      await this.nvim.call('winrestview', storeView);
    };
  }

  async setLines(lines: string[], start: number, end: number, notify = false) {
    if (!notify) {
      this.nvim.pauseNotification();
    }

    this.buffer.setOption('modifiable', true, true);

    await this.buffer.setLines(
      lines,
      {
        start,
        end,
      },
      true,
    );

    this.buffer.setOption('modifiable', false, true);

    if (!notify) {
      await this.nvim.resumeNotification();
    }
  }

  private async clearContent() {
    await this.setLines([], 0, -1, true);

    this.sources.forEach((source) => {
      source.lines = [];
      source.startLine = 0;
      source.endLine = 0;
    });
  }

  async reloadAll({ render = true, notify = false } = {}) {
    if (!notify) {
      this.nvim.pauseNotification();
    }

    await Promise.all(this.sources.map((source) => source.reload(null, { render: false, notify: true })));

    if (render) {
      await this.renderAll();
    }

    if (!notify) {
      await this.nvim.resumeNotification();
    }
  }

  async renderAll(notify = false) {
    if (!notify) {
      this.nvim.pauseNotification();
    }

    await this.clearContent();
    for (const source of this.sources) {
      await source.render({ notify });
    }

    if (!notify) {
      await this.nvim.resumeNotification();
    }
  }
}
