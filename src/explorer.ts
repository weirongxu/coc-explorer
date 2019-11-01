import { Buffer, Emitter, events, ExtensionContext, Window, workspace } from 'coc.nvim';
import { onError } from './logger';
import { Action, mappings } from './mappings';
import { ArgPosition, Args, parseArgs } from './parse-args';
import { hlGroupManager } from './source/highlight-manager';
import { IndexesManager } from './indexes-manager';
import './source/load';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { sourceManager } from './source/source-manager';
import { execNotifyBlock, autoReveal, config } from './util';

export class Explorer {
  // id for matchaddpos
  static colorId = 10800;

  name = 'coc-explorer';
  position: ArgPosition = 'left';
  nvim = workspace.nvim;
  previousBufnr?: number;
  revealFilepath?: string;
  isHelpUI: boolean = false;
  rootPathRecords: Set<string> = new Set();
  indexesManager = new IndexesManager(this);
  emitterDidAutoload = new Emitter<void>();
  emitterDidInit = new Emitter<number>();

  private _buffer?: Buffer;
  private _bufnr?: number;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private _rootPath?: string;
  private lastArgStrings?: string[];
  /**
   * mappings[key][mode] = '<Plug>(coc-action-mode-key)'
   */
  private mappings: Record<string, Record<string, string>> = {};
  private registeredMapping: boolean = false;
  private onRegisteredMapping = new Emitter<void>();

  constructor(public context: ExtensionContext) {
    const { subscriptions } = context;

    subscriptions.push(
      events.on('BufWinLeave', (bufnr) => {
        if (bufnr !== this._bufnr) {
          this.previousBufnr = bufnr;
        }
      }),
    );

    this.emitterDidAutoload.event(() => {
      this.registerMappings().catch(onError);
      hlGroupManager.registerHighlightSyntax().catch(onError);
    });
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

  get rootPath(): string {
    if (!this._rootPath) {
      throw Error('Explorer rootPath not initialized yet');
    }
    return this._rootPath;
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
    if (!this.registeredMapping) {
      await new Promise((resolve) => {
        this.onRegisteredMapping.event(resolve);
      });
    }

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

    if (!inited) {
      this.emitterDidInit.fire(this._bufnr);
    }

    if (this.isHelpUI) {
      await this.sources[0].quitHelp();
    }

    await execNotifyBlock(async () => {
      for (const source of this.sources) {
        await source.opened(true);
      }

      const firstFileSource = this.sources.find((s) => s instanceof FileSource) as
        | FileSource
        | undefined;
      let node: FileNode | null = null;

      if (firstFileSource) {
        firstFileSource.root = this.rootPath;
      }

      await this.reloadAll({ render: false });

      if (firstFileSource) {
        if (this.revealFilepath && autoReveal) {
          node = await firstFileSource.revealNodeByPath(
            this.revealFilepath,
            firstFileSource.rootNode.children,
          );
        }
      }

      await this.renderAll({ notify: true });

      if (firstFileSource) {
        if (this.revealFilepath && autoReveal) {
          if (node !== null) {
            await firstFileSource.gotoNode(node, { col: 1, notify: true });
          } else {
            await firstFileSource.gotoRoot({ col: 1, notify: true });
          }
        } else if (!inited) {
          await firstFileSource.gotoRoot({ col: 1, notify: true });
        }
      }
    });
  }

  private async getRootPath() {
    let useGetcwd = false;
    const buftype = await this.nvim.getVar('&buftype');
    if (buftype === 'nofile') {
      useGetcwd = true;
    } else {
      const bufname = await this.nvim.call('bufname', ['%']);
      if (!bufname) {
        useGetcwd = true;
      }
    }
    return useGetcwd ? ((await this.nvim.call('getcwd', [])) as string) : workspace.rootPath;
  }

  private async initArgs(argStrings: string[]) {
    if (!this.lastArgStrings || this.lastArgStrings.toString() !== argStrings.toString()) {
      this._args = await parseArgs(...argStrings);
      this.lastArgStrings = argStrings;

      this._sources = this.args.sources
        .map((sourceArg) => {
          if (sourceManager.registeredSources[sourceArg.name]) {
            const source = sourceManager.registeredSources[sourceArg.name];
            source.bindExplorer(this, sourceArg.expand);
            return source;
          } else {
            // tslint:disable-next-line: ban
            workspace.showMessage(`explorer source(${sourceArg.name}) not found`, 'error');
            return null;
          }
        })
        .filter((source): source is ExplorerSource<any> => source !== null);
    }

    this._rootPath = this.args.rootPath || (await this.getRootPath());
    this.revealFilepath =
      this.args.revealPath || ((await this.nvim.call('expand', '%:p')) as string);
    this.rootPathRecords.add(this._rootPath);
  }

  async prompt(msg: string): Promise<'yes' | 'no' | null>;
  async prompt<T extends string>(msg: string, choices: T[], defaultChoice?: T): Promise<T | null>;
  async prompt(msg: string, choices?: string[], defaultChoice?: string): Promise<string | null> {
    if (!choices) {
      choices = ['yes', 'no'];
      defaultChoice = 'no';
    }
    const defaultNumber = defaultChoice ? choices.indexOf(defaultChoice) : -1;
    const result = (await this.nvim.call('confirm', [
      msg,
      choices
        .map((c) => {
          return '&' + c[0].toUpperCase() + c.slice(1);
        })
        .join('\n'),
      defaultNumber + 1,
    ])) as number;
    if (result === 0) {
      return null;
    } else {
      return choices[result - 1] || null;
    }
  }

  async registerMappings() {
    this.mappings = {};
    Object.entries(mappings).forEach(([key, actions]) => {
      this.mappings[key] = {};
      (['n', 'v'] as ('n' | 'v')[]).forEach((mode) => {
        const plugKey = `explorer-action-${mode}-${key.replace(/\<(.*)\>/, '[$1]')}`;
        this.context.subscriptions.push(
          workspace.registerKeymap([mode], plugKey, async () => {
            this.doActions(actions, mode).catch(onError);
          }),
        );
        this.mappings[key][mode] = `<Plug>(coc-${plugKey})`;
      });
    });
    await this.nvim.call('coc_explorer#register_mappings', [this.mappings]);
    this.registeredMapping = true;
    this.onRegisteredMapping.fire();
  }

  async executeMappings() {
    await this.nvim.call('coc_explorer#execute_mappings', [this.mappings]);
  }

  async clearMappings() {
    await this.nvim.call('coc_explorer#clear_mappings', [this.mappings]);
  }

  async doActions(actions: Action[], mode: 'n' | 'v' = 'n') {
    for (const action of actions) {
      await this.doAction(action, mode);
    }
  }

  async doAction(action: Action, mode: 'n' | 'v' = 'n') {
    const { nvim } = this;

    const lineIndexes: number[] = [];
    const document = await workspace.document;
    if (mode === 'v') {
      const range = await workspace.getSelectedRange('v', document);
      if (range) {
        for (let line = range.start.line; line <= range.end.line; line++) {
          lineIndexes.push(line);
        }
      }
    } else {
      const line = ((await nvim.call('line', '.')) as number) - 1;
      lineIndexes.push(line);
    }

    const nodesGroup: Map<ExplorerSource<any>, Set<object | null>> = new Map();

    for (const lineIndex of lineIndexes) {
      const [source] = this.findSourceByLineIndex(lineIndex);
      if (source) {
        if (!nodesGroup.has(source)) {
          nodesGroup.set(source, new Set());
        }
        const relativeLineIndex = lineIndex - source.startLine;

        nodesGroup
          .get(source)!
          .add(relativeLineIndex === 0 ? null : source.flattenNodes[relativeLineIndex]);
      }
    }

    await Promise.all(
      Array.from(nodesGroup.entries()).map(async ([source, nodes]) => {
        if (nodes.has(null)) {
          await source.doRootAction(action.name, action.arg);
        } else {
          await source.doAction(action.name, Array.from(nodes).filter((item) => item), action.arg);
        }
      }),
    );
  }

  private findSourceByLineIndex(lineIndex: number) {
    const sourceIndex = this.sources.findIndex((source) => lineIndex < source.endLine);
    if (sourceIndex === -1) {
      return [null, -1] as [null, -1];
    } else {
      return [this.sources[sourceIndex], sourceIndex] as [ExplorerSource<any>, number];
    }
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
        col: col + 1,
      };
    }
    return null;
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
      const [, sourceIndex] = this.findSourceByLineIndex(storeCursor.lineIndex);
      const source = this.sources[sourceIndex];
      if (source) {
        const sourceLineIndex = storeCursor.lineIndex - source.startLine;
        const storeNode: BaseTreeNode<any> = source.getNodeByLine(
          sourceLineIndex,
        );
        return async (notify = false) => {
          await execNotifyBlock(async () => {
            this.nvim.call('winrestview', [storeView], true);
            await source.gotoNode(storeNode, {
              lineIndex: sourceLineIndex,
              col: storeCursor.col,
              notify: true,
            });
          }, notify);
        };
      }
    }
    return async (notify = false) => {
      await execNotifyBlock(() => {
        this.nvim.call('winrestview', storeView, true);
      }, notify);
    };
  }

  async setLines(lines: string[], start: number, end: number, notify = false) {
    await execNotifyBlock(async () => {
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
    }, notify);
  }

  // private async clearContent() {
  //   await this.setLines([], 0, -1, true);
  //
  //   this.sources.forEach((source) => {
  //     source.lines = [];
  //     source.startLine = 0;
  //     source.endLine = 0;
  //   });
  // }

  async reloadAll({ render = true, notify = false } = {}) {
    await execNotifyBlock(async () => {
      await Promise.all(
        this.sources.map((source) =>
          source.reload(source.rootNode, { render: false, notify: true }),
        ),
      );

      if (render) {
        await this.renderAll({ notify: true, storeCursor: false });
      }
    }, notify);
  }

  async renderAll({ notify = false, storeCursor = false } = {}) {
    await execNotifyBlock(async () => {
      const store = storeCursor ? await this.storeCursor() : null;

      // await this.clearContent();
      for (const source of this.sources) {
        await source.render({ notify: true, storeCursor: false });
      }

      if (store) {
        await store(true);
      }
    }, notify);
  }

  async quit() {
    const win = await this.win;
    if (win) {
      await win.close(true);
    }
  }

  /**
   * select windows from current tabpage
   */
  async selectWindowsUI(
    selected: (winnr: number) => void | Promise<void>,
    noChoice: () => void | Promise<void> = () => {},
  ) {
    const winnr = await this.nvim.call('coc_explorer#select_wins', [
      this.name,
      config.get<boolean>('openAction.select.filterFloatWindows')!,
    ]);
    if (winnr > 0) {
      await Promise.resolve(selected(winnr));
    } else if (winnr === -1) {
      await Promise.resolve(noChoice());
    }
  }
}

import { FileNode, FileSource } from './source/sources/file/file-source';
