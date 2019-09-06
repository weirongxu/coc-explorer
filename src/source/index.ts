import { Disposable, listManager, workspace, Buffer } from 'coc.nvim';
import { Range } from 'vscode-languageserver-protocol';
import { explorerActions } from '../actions-list';
import { Explorer } from '../explorer';
import { onError } from '../logger';
import { Action, ActionSyms, mappings, reverseMappings } from '../mappings';
import { byteIndex, byteLength, chunk, supportBufferHighlight } from '../util';
import { SourceRowBuilder, SourceViewBuilder } from './view-builder';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
};

export abstract class ExplorerSource<
  Item extends object & {
    parent?: Item;
  }
> {
  abstract name: string;
  startLine: number = 0;
  endLine: number = 0;
  items: Item[] = [];
  lines: [string, null | Item][] = [];
  selectedItems: Set<Item> = new Set();
  relativeHlRanges: Record<string, Range[]> = {};
  abstract hlSrcId: number;

  actions: Record<
    string,
    {
      description: string;
      options: Partial<ActionOptions>;
      callback: (items: Item[], arg: string) => void | Promise<void>;
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
  hlIds: number[] = [];
  nvim = workspace.nvim;

  private _explorer?: Explorer;
  private _expanded?: boolean;

  constructor() {
    this.addAction(
      'normal',
      async (_item, arg) => {
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
        await this.reload(null);
      },
      'refresh',
      { multi: false },
    );
    this.addAction(
      'help',
      async (items) => {
        await this.renderHelp(items === null);
      },
      'show help',
      { multi: false },
    );
    this.addAction(
      'actionMenu',
      async (items) => {
        await this.actionMenu(items);
      },
      'show actions in coc-list',
    );
    this.addItemAction(
      'select',
      async (item) => {
        this.selectedItems.add(item);
        await this.render();
      },
      'toggle item selection',
      { multi: false },
    );
    this.addItemAction(
      'unselect',
      async (item) => {
        this.selectedItems.delete(item);
        await this.render();
      },
      'toggle item selection',
      { multi: false },
    );
    this.addItemAction(
      'toggleSelection',
      async (item) => {
        if (this.selectedItems.has(item)) {
          await this.doAction('unselect', item);
        } else {
          await this.doAction('select', item);
        }
        await this.render();
      },
      'toggle item selection',
      { multi: false },
    );
  }

  bindExplorer(explorer: Explorer, expanded: boolean) {
    this._explorer = explorer;
    this._expanded = expanded;

    // init
    Promise.resolve(this.init()).catch(onError);
  }

  get explorer() {
    if (this._explorer !== undefined) {
      return this._explorer;
    }
    throw new Error(`source(${this.name}) unbound to explorer`);
  }

  async gotoPrevWin() {
    const { nvim } = this;
    if (this.explorer.previousBufnr) {
      const winnr = await this.nvim.call('bufwinnr', [this.explorer.previousBufnr]);
      if (winnr !== this.explorer.winnr && winnr > 0) {
        await nvim.command(`${winnr}wincmd w`);
        return true;
      } else {
        return false;
      }
    }
  }

  get expanded() {
    if (this._expanded !== undefined) {
      return this._expanded;
    }
    throw new Error(`source(${this.name}) unbound to explorer`);
  }

  set expanded(expanded: boolean) {
    this._expanded = expanded;
  }

  init() {}

  /**
   * highlight ranges with real positions
   */
  get readHlRanges() {
    const hlRanges: Record<string, Range[]> = {};
    for (const hlGroup in this.relativeHlRanges) {
      hlRanges[hlGroup] = this.relativeHlRanges[hlGroup].map((range) =>
        Range.create(
          {
            line: this.startLine + range.start.line,
            character: range.start.character,
          },
          {
            line: this.startLine + range.end.line,
            character: range.end.character,
          },
        ),
      );
    }
    return hlRanges;
  }

  addAction(
    name: ActionSyms,
    callback: (items: Item[] | null, arg: string) => void | Promise<void>,
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

  addItemsAction(
    name: ActionSyms,
    callback: (item: Item[], arg: string) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback,
      description,
      options,
    };
  }

  addItemAction(
    name: ActionSyms,
    callback: (item: Item, arg: string) => void | Promise<void>,
    description: string,
    options: Partial<ActionOptions> = {},
  ) {
    this.actions[name] = {
      callback: async (items: Item[], arg) => {
        for (const item of items) {
          await callback(item, arg);
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

    if (render) {
      await this.render();
    }
    if (reload) {
      await this.reload(null);
    }
  }

  async doAction(name: ActionSyms, items: Item | Item[], arg: string = '') {
    const action = this.actions[name];
    if (!action) {
      return;
    }

    const { multi = true, render = false, reload = false } = action.options;

    const finalItems = Array.isArray(items) ? items : [items];
    if (multi) {
      if (this.selectedItems.size > 0) {
        const items = Array.from(this.selectedItems);
        this.selectedItems.clear();
        await action.callback(items, arg);
      } else {
        await action.callback(finalItems, arg);
      }
    } else {
      await action.callback([finalItems[0]], arg);
    }

    if (render) {
      await this.render();
    }
    if (reload) {
      await this.reload(null);
    }
  }

  async copy(content: string) {
    await this.nvim.call('setreg', ['+', content]);
    await this.nvim.call('setreg', ['"', content]);
  }

  async actionMenu(items: Item[] | null) {
    const actions = items === null ? this.rootActions : this.actions;
    explorerActions.setExplorerActions(
      Object.entries(actions)
        .map(([name, { callback, description }]) => ({
          name,
          items,
          mappings,
          root: items === null,
          key: reverseMappings[name],
          description,
          callback,
        }))
        .filter((a) => a.name !== 'actionMenu'),
    );
    const disposable = listManager.registerList(explorerActions);
    await listManager.start(['--normal', '--number-select', 'explorerActions']);
    disposable.dispose();
  }

  isSelectedAny() {
    return this.selectedItems.size !== 0;
  }

  isSelectedItem(item: Item) {
    return this.selectedItems.has(item);
  }

  async currentCol() {
    return (await this.nvim.call('col', '.')) as number;
  }

  /**
   * current cursor
   * @returns return null if outside this source
   */
  async currentCursor() {
    const winid = await this.explorer.winid;
    if (winid) {
      const [line, col] = await this.nvim.createWindow(winid).cursor;
      const lineIndex = line - 1;
      // const line = ((await this.nvim.call('line', '.')) as number) - 1;
      if (lineIndex < this.startLine || lineIndex > this.endLine) {
        return null;
      } else {
        return {
          lineIndex: lineIndex - this.startLine,
          col,
        };
      }
    }
    return null;
  }

  async currentItem() {
    const cursor = await this.currentCursor();
    if (cursor) {
      const line = this.lines[cursor.lineIndex];
      if (line) {
        return line[1];
      }
    }
    return null;
  }

  getItemByIndex(lineIndex: number) {
    const line = this.lines[lineIndex];
    return line ? line[1] : null;
  }

  async gotoLineIndex(lineIndex: number, col?: number) {
    const finalCol = col === undefined ? await this.currentCol() : col;
    const winid = await this.explorer.winid;
    if (winid) {
      try {
        await this.nvim.createWindow(winid).setCursor([this.startLine + lineIndex + 1, finalCol - 1]);
        // await this.nvim.call('cursor', [this.startLine + lineIndex + 1, finalCol]);
      } catch (err) {}
    }
  }

  async gotoItem(item: Item | null, col?: number) {
    const finalCol = col === undefined ? await this.currentCol() : col;
    const lineIndex = this.lines.findIndex(([, it]) => it === item);
    if (lineIndex !== -1) {
      await this.gotoLineIndex(lineIndex, finalCol);
    } else if (item && item.parent) {
      await this.gotoItem(item.parent, col);
    } else {
      await this.gotoItem(null, col);
    }
  }

  abstract loadItems(item: null | Item): Promise<Item[]>;
  abstract draw(builder: SourceViewBuilder<Item>): void;
  async loaded(_item: null | Item): Promise<void> {}

  async reload(
    item: null | Item,
    { render = true, notify = false }: { buffer?: Buffer; render?: boolean; notify?: boolean } = {},
  ) {
    this.items = await this.loadItems(item);
    await this.loaded(item);
    this.selectedItems = new Set();
    if (render) {
      await this.render(notify);
    }
  }

  async render(notify = false) {
    const storeCursor = await this.currentCursor();
    const view = await this.nvim.call('winsaveview');

    const builder = new SourceViewBuilder<Item>();
    this.draw(builder);
    this.lines = builder.lines;
    this.relativeHlRanges = builder.relativeHlRanges;
    await this.partRender(notify);

    const cursorCol = (await this.nvim.call('col', '.')) as number;
    if (storeCursor) {
      const storeItem = await this.getItemByIndex(storeCursor.lineIndex);
      await this.nvim.call('winrestview', view);
      await this.gotoItem(storeItem, cursorCol);
    } else {
      await this.nvim.call('winrestview', view);
    }

    if (workspace.env.isVim) {
      await this.nvim.command('redraw');
    }
  }

  private async partRender(notify = false) {
    if (!notify) {
      this.nvim.pauseNotification();
    }

    const buffer = this.explorer.buffer;
    const sourceIndex = this.explorer.sources.indexOf(this);
    const isLastSource = this.explorer.sources.length - 1 == sourceIndex;

    await this.explorer.setLines(
      this.lines.map(([content]) => content),
      this.startLine,
      isLastSource ? -1 : this.endLine,
      true,
    );

    let lineNumber = this.startLine;
    this.explorer.sources.slice(sourceIndex).forEach((source) => {
      source.startLine = lineNumber;
      lineNumber += source.lines.length;
      source.endLine = lineNumber;
    });

    buffer.setOption('modifiable', false, true);

    await this.renderHighlights(this.readHlRanges);

    if (!notify) {
      await this.nvim.resumeNotification();
    }
  }

  private async renderHighlights(highlights: Record<string, Range[]>) {
    const { buffer } = this.explorer;

    if (supportBufferHighlight) {
      if (!workspace.env.isVim) {
        await buffer.clearHighlight({
          srcId: this.hlSrcId,
        });
      }

      for (const [hlGroup, ranges] of Object.entries(highlights)) {
        for (const range of ranges) {
          await buffer.addHighlight({
            hlGroup,
            line: range.start.line,
            colStart: range.start.character,
            colEnd: range.end.character,
            srcId: this.hlSrcId,
          });
        }
      }
    } else {
      this.vimClearHighlights(this.hlIds);
      this.hlIds = [];
      for (const [hlGroup, ranges] of Object.entries(highlights)) {
        this.hlIds.push(...this.vimAddHighlights(ranges, hlGroup));
      }

      this.nvim.command('redraw', true);
    }
  }

  private vimClearHighlights(ids: number[]) {
    this.nvim.call('coc_explorer#clearmatches', [Array.from(ids)], true);
  }

  private vimAddHighlights(ranges: Range[], hlGroup: string): number[] {
    const priority = 10;
    const res: number[] = [];
    const arr: number[][] = [];
    for (const range of ranges) {
      const { start, end } = range;
      const line = this.lines[start.line - this.startLine][0];
      if (start.character == end.character) {
        continue;
      }
      arr.push([
        start.line + 1,
        byteIndex(line, start.character) + 1,
        byteLength(line.slice(start.character, end.character)),
      ]);
    }
    for (const pos of chunk(arr, 8)) {
      const id = Explorer.colorId;
      Explorer.colorId = Explorer.colorId + 1;
      this.nvim.call('matchaddpos', [hlGroup, pos, priority, id], true);
      res.push(id);
    }
    this.nvim.call('coc_explorer#add_matchids', [res], true);
    return res;
  }

  /**
   * select windows from current tabpage
   */
  async selectWindowsUI(
    selected: (winnr: number) => void | Promise<void>,
    nothingChoice: () => void | Promise<void> = () => {},
  ) {
    const winnr = await this.nvim.call('coc_explorer#select_wins', [this.explorer.name]);
    if (winnr > 0) {
      await Promise.resolve(selected(winnr));
    } else if (winnr == 0) {
      await Promise.resolve(nothingChoice());
    }
  }

  private async renderHelp(isRoot: boolean) {
    const builder = new SourceViewBuilder<null>();
    const width = await this.nvim.call('winwidth', '%');

    builder.newItem(null, (row) => {
      row.add(` Help for [${this.name}${isRoot ? ' root' : ''}], (use q or <esc> return to explorer)`);
    });
    builder.newItem(null, (row) => {
      row.add('—'.repeat(width), 'Operator');
    });

    const registeredActions = isRoot ? this.rootActions : this.actions;
    const drawAction = (row: SourceRowBuilder, action: Action) => {
      row.add(action.name, 'Identifier');
      row.add(' ');
      row.add(registeredActions[action.name].description, 'Comment');
    };
    Object.entries(mappings).forEach(([key, actions]) => {
      if (!actions.every((action) => action.name in registeredActions)) {
        return;
      }
      builder.newItem(null, (row) => {
        row.add(' ');
        row.add(key, 'PreProc');
        row.add(' - ');
        drawAction(row, actions[0]);
      });
      actions.slice(1).forEach((action) => {
        builder.newItem(null, (row) => {
          row.add(' '.repeat(key.length + 4));

          drawAction(row, action);
        });
      });
    });

    this.nvim.pauseNotification();

    await this.explorer.setLines(builder.lines.map(([content]) => content), 0, -1, true);

    await this.renderHighlights(builder.relativeHlRanges);

    await this.nvim.resumeNotification();

    await this.explorer.clearMappings();

    const disposables: Disposable[] = [];
    await new Promise((resolve) => {
      ['<esc>', 'q'].forEach((key) => {
        disposables.push(
          // @ts-ignore FIXME upgrade to latest coc.nvim
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

    await this.explorer.initMappings();
    await this.explorer.renderAll();
  }
}
