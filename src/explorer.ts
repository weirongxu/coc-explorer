import { Buffer, ExtensionContext, Window, workspace, Disposable } from 'coc.nvim';
import { Action, ActionMode, mappings, ActionSyms } from './mappings';
import { Args } from './parse-args';
import { IndexesManager } from './indexes-manager';
import './source/load';
import { BaseTreeNode, ExplorerSource, ActionOptions } from './source/source';
import { sourceManager } from './source/source-manager';
import {
  execNotifyBlock,
  autoReveal,
  config,
  enableDebug,
  enableWrapscan,
  avoidOnBufEnter,
  onEvents,
  onBufEnter,
  PreviewStrategy,
  queueAsyncFunction,
  previewStrategy,
} from './util';
import { ExplorerManager } from './explorer-manager';
import { hlGroupManager } from './source/highlight-manager';
import { BuffuerContextVars } from './context-variables';
import { SourceViewBuilder, SourceRowBuilder } from './source/view-builder';
import { FloatingPreview } from './floating/floating-preview';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
  arg: hl('HelpArg', 'Identifier'),
  description: hl('HelpDescription', 'Comment'),
};

export class Explorer {
  nvim = workspace.nvim;
  isHelpUI: boolean = false;
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
        arg: string | undefined,
        mode: ActionMode,
      ) => void | Promise<void>;
    }
  > = {};
  context: ExtensionContext;
  floatingWindow = new FloatingPreview(this);

  private _buffer?: Buffer;
  private _args?: Args;
  private _sources?: ExplorerSource<any>[];
  private lastArgSources?: string;

  static async create(explorerManager: ExplorerManager, args: Args) {
    explorerManager.maxExplorerID += 1;
    const explorer = await avoidOnBufEnter(async () => {
      const bufnr = (await workspace.nvim.call('coc_explorer#create', [
        explorerManager.bufferName,
        explorerManager.maxExplorerID,
        args.position,
        args.width,
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
      onEvents('CursorMoved', async (bufnr) => {
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
      { multi: false },
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
      { multi: false },
    );
    this.addGlobalAction(
      'normal',
      async (_node, arg) => {
        if (arg) {
          await this.nvim.command('normal ' + arg);
        }
      },
      'execute vim normal mode commands',
      { multi: false },
    );
    this.addGlobalAction(
      'quit',
      async () => {
        await this.quit();
      },
      'quit explorer',
      { multi: false },
    );
    this.addGlobalAction(
      'preview',
      async (nodes, arg) => {
        const source = await this.currentSource();
        if (nodes && nodes[0] && source) {
          const node = nodes[0];
          const nodeIndex = source.getLineByNode(node);
          await this.floatingWindow.previewNode(
            (arg as PreviewStrategy) || previewStrategy,
            source,
            node,
            nodeIndex,
          );
        }
      },
      'preview',
      { multi: false },
    );

    this.addGlobalAction(
      'gotoSource',
      async (_nodes, name) => {
        const source = this.sources.find((s) => s.sourceName === name);
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

  async executeHighlightSyntax() {
    const winnr = await this.winnr;
    const curWinnr = await this.nvim.call('winnr');
    if (winnr) {
      await execNotifyBlock(async () => {
        if (winnr !== curWinnr) {
          this.nvim.command(`${winnr}wincmd w`, true);
        }
        await hlGroupManager.executeHighlightSyntax(true);
        if (winnr !== curWinnr) {
          this.nvim.command(`${curWinnr}wincmd w`, true);
        }
      });
    }
  }

  async resume(args: Args) {
    const win = await this.win;
    if (win) {
      // focus on explorer window
      await this.nvim.command(`${await win.number}wincmd w`);
    } else {
      // resume the explorer window
      await this.nvim.call('coc_explorer#resume', [this.bufnr, args.position, args.width]);
    }
  }

  async open(args: Args) {
    if (this.isHelpUI) {
      await this.quitHelp();
    }

    await this.executeHighlightSyntax();

    await this.initArgs(args);

    await execNotifyBlock(async () => {
      for (const source of this.sources) {
        await source.opened(true);
      }

      const firstFileSource = this.sources.find((s) => s instanceof FileSource) as
        | FileSource
        | undefined;
      let node: FileNode | null = null;

      if (firstFileSource) {
        firstFileSource.root = this.args.rootPath;
      }

      if (firstFileSource) {
        if (autoReveal && this.args.revealPath) {
          node = await firstFileSource.revealNodeByPath(this.args.revealPath);
        }
      }

      await this.reloadAll({ render: false, notify: true });
      await this.renderAll({ notify: true });

      if (firstFileSource) {
        if (autoReveal) {
          if (node !== null) {
            await firstFileSource.gotoNode(node, { col: 1, notify: true });
          } else {
            await firstFileSource.gotoRoot({ col: 1, notify: true });
          }
        }
      }
    });
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
    if (!this.lastArgSources || this.lastArgSources !== args.sources.toString()) {
      this.lastArgSources = args.sources.toString();

      this._sources = this.args.sources
        .map((sourceArg) => sourceManager.createSource(sourceArg.name, this, sourceArg.expand))
        .filter((source): source is ExplorerSource<any> => source !== null);
    }

    this.explorerManager.rootPathRecords.add(this.args.rootPath);
  }

  addGlobalAction(
    name: ActionSyms,
    callback: (
      nodes: BaseTreeNode<any>[] | null,
      arg: string | undefined,
      mode: ActionMode,
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

  _doActions?: (actions: Action[], mode: ActionMode, count?: number) => Promise<void>;
  async doActions(actions: Action[], mode: ActionMode, count: number = 1) {
    if (!this._doActions) {
      this._doActions = queueAsyncFunction(
        async (actions: Action[], mode: ActionMode, count: number = 1) => {
          for (var i = 0; i < count; i++) {
            for (const action of actions) {
              await this.doAction(action, mode);
            }
          }
          await execNotifyBlock(async () => {
            await Promise.all(
              this.sources.map(async (source) => {
                return source.emitRequestRenderNodes(true);
              }),
            );
          });
        },
      );
    }
    return this._doActions(actions, mode, count);
  }

  async doAction(action: Action, mode: ActionMode = 'n') {
    const { nvim } = this;
    const now = Date.now();

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
          .add(relativeLineIndex === 0 ? null : source.flattenedNodes[relativeLineIndex]);
      }
    }

    await Promise.all(
      Array.from(nodesGroup.entries()).map(async ([source, nodes]) => {
        if (nodes.has(null)) {
          await source.doRootAction(action.name, action.arg);
        } else {
          await source.doAction(
            action.name,
            Array.from(nodes).filter((node) => node),
            action.arg,
            mode,
          );
        }
      }),
    );

    if (enableDebug) {
      let actionDisplay = action.name;
      if (action.arg) {
        actionDisplay += ':' + action.arg;
      }
      // tslint:disable-next-line: ban
      workspace.showMessage(`action(${actionDisplay}): ${Date.now() - now}ms`, 'more');
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
    const sourceIndex = this.sources.findIndex((source) => lineIndex < source.endLine);
    if (sourceIndex === -1) {
      return [null, -1] as [null, -1];
    } else {
      return [this.sources[sourceIndex], sourceIndex] as [ExplorerSource<any>, number];
    }
  }

  async currentSource(): Promise<ExplorerSource<BaseTreeNode<any>> | undefined> {
    return this.sources[await this.currentSourceIndex()];
  }

  async currentSourceIndex() {
    const lineIndex = await this.currentLineIndex();
    return this.sources.findIndex(
      (source) => lineIndex >= source.startLine && lineIndex < source.endLine,
    );
  }

  async currentNode() {
    const source = await this.currentSource();
    if (source) {
      const nodeIndex = (await this.currentLineIndex()) - source.startLine;
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
      const [, sourceIndex] = this.findSourceByLineIndex(storeCursor.lineIndex);
      const source = this.sources[sourceIndex];
      if (source) {
        const sourceLineIndex = storeCursor.lineIndex - source.startLine;
        const storeNode: BaseTreeNode<any> = source.getNodeByLine(sourceLineIndex);
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

  async gotoLineIndex(lineIndex: number, col?: number, notify = false) {
    await execNotifyBlock(async () => {
      const finalCol = col === undefined ? await this.currentCol() : col;
      const win = await this.win;
      if (win) {
        win.setCursor([lineIndex + 1, finalCol - 1], true);
        if (!this.explorerManager.currentExplorer()) {
          this.nvim.command('redraw!', true);
        }
      }
    }, notify);
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
        await source.render({ notify: true, storeCursor: false, force: true });
      }

      if (store) {
        await store(true);
      }
    }, notify);
  }

  /**
   * select windows from current tabpage
   */
  async selectWindowsUI(
    selected: (winnr: number) => void | Promise<void>,
    noChoice: () => void | Promise<void> = () => {},
  ) {
    const winnr = await this.nvim.call('coc_explorer#select_wins', [
      this.explorerManager.bufferName,
      config.get<boolean>('openAction.select.filterFloatWindows')!,
    ]);
    if (winnr > 0) {
      await Promise.resolve(selected(winnr));
    } else if (winnr === 0) {
      await Promise.resolve(noChoice());
    }
  }

  async showHelp(source: ExplorerSource<any>, isRoot: boolean) {
    this.isHelpUI = true;
    const builder = new SourceViewBuilder();
    const width = await this.nvim.call('winwidth', '%');
    const storeCursor = await this.storeCursor();
    const lines: string[] = [];

    lines.push(
      await builder.drawRowLine((row) => {
        row.add(
          `Help for [${source.sourceName}${
            isRoot ? ' root' : ''
          }], (use q or <esc> return to explorer)`,
        );
      }),
    );
    lines.push(
      await builder.drawRowLine((row) => {
        row.add('—'.repeat(width), helpHightlights.line);
      }),
    );

    const registeredActions = {
      ...this.globalActions,
      ...(isRoot ? source.rootActions : source.actions),
    };
    const drawAction = (row: SourceRowBuilder, action: Action) => {
      row.add(action.name, helpHightlights.action);
      if (action.arg) {
        row.add(`(${action.arg})`, helpHightlights.arg);
      }
      row.add(' ');
      row.add(registeredActions[action.name].description, helpHightlights.description);
    };
    for (const [key, actions] of Object.entries(mappings)) {
      if (!actions.every((action) => action.name in registeredActions)) {
        continue;
      }
      lines.push(
        await builder.drawRowLine((row) => {
          row.add(' ');
          row.add(key, helpHightlights.mappingKey);
          row.add(' - ');
          drawAction(row, actions[0]);
        }),
      );
      for (const action of actions.slice(1)) {
        lines.push(
          await builder.drawRowLine((row) => {
            row.add(' '.repeat(key.length + 4));
            drawAction(row, action);
          }),
        );
      }
    }

    await execNotifyBlock(async () => {
      await this.setLines(lines, 0, -1, true);
    });

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
            await this.renderAll({ storeCursor: false });
            await storeCursor();
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

import { FileNode, FileSource } from './source/sources/file/file-source';
