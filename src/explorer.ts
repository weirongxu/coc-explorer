import { ExtensionContext, workspace, Disposable, Window, events, Buffer } from 'coc.nvim';
import { Args, parseArgs, ArgPosition } from './parse-args';
import './source/load';
import { ExplorerSource } from './source';
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

  private _buffer?: Buffer;
  private _bufnr?: number;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private lastArgStrings?: string[];

  constructor(public context: ExtensionContext) {
    const { subscriptions } = context;

    subscriptions.push(
      events.on('BufWinLeave', (bufnr) => {
        this.previousBufnr = bufnr;
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

  /**
   * get vim window in current tabpage
   */
  get tabpageWin(): Promise<Window | null> {
    return new Promise<Window | null>(async (resolve) => {
      const tabpage = await this.nvim.tabpage;
      const wins = await tabpage.windows;
      const winBufs = await Promise.all(
        wins.map(async (win) => ({
          win,
          buf: await win.buffer,
        })),
      );
      for (const winBuf of winBufs) {
        if (winBuf.buf.id === this.bufnr) {
          resolve(winBuf.win);
          return;
        }
      }
      // Explorer window not found in this tabpage
      resolve(null);
    });
  }

  get winnr(): Promise<number | null> {
    return this.tabpageWin.then(async (win) => {
      if (win) {
        return await win.number;
      } else {
        return null;
      }
    });
  }

  get winid(): Promise<number | null> {
    return this.tabpageWin.then((win) => {
      if (win) {
        return win.id;
      } else {
        return null;
      }
    });
  }

  async open(argStrings: string[]) {
    const { nvim } = this;

    await this.initArgs(argStrings);

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
      const source = this.sources.find((source) => lineIndex < source.endLine);
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
      await source.render(notify);
    }

    if (!notify) {
      await this.nvim.resumeNotification();
    }
  }
}
