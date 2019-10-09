import { Buffer, Disposable, listManager, workspace } from 'coc.nvim';
import { Range } from 'vscode-languageserver-protocol';
import { explorerActions } from '../lists/actions';
import { Explorer } from '../explorer';
import { onError } from '../logger';
import { Action, ActionSyms, mappings, reverseMappings } from '../mappings';
import { config, execNotifyBlock, findLast } from '../util';
import { SourceRowBuilder, SourceViewBuilder } from './view-builder';
import { hlGroupManager } from './highlight-manager';

export type ActionOptions = {
  multi: boolean;
  render: boolean;
  reload: boolean;
  select: boolean;
};

export const enableNerdfont = config.get<string>('icon.enableNerdfont')!;

export const sourceIcons = {
  expanded: config.get<string>('icon.expanded') || (enableNerdfont ? '' : '-'),
  shrinked: config.get<string>('icon.shrinked') || (enableNerdfont ? '' : '+'),
  selected: config.get<string>('icon.selected')!,
  unselected: config.get<string>('icon.unselected')!,
};

const hl = hlGroupManager.hlLinkGroupCommand.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
  arg: hl('HelpArg', 'Identifier'),
  description: hl('HelpDescription', 'Comment'),
};
hlGroupManager.register(helpHightlights);

export interface BaseItem<Item extends BaseItem<any>> {
  uid: string;
  parent?: Item;
}

export abstract class ExplorerSource<Item extends BaseItem<Item>> {
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
  hlIds: number[] = []; // hightlight match ids for vim8.0
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
      async (items) => {
        const item = items ? items[0] : null;
        await this.reload(item);
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
      { multi: false, select: true },
    );
    this.addItemAction(
      'unselect',
      async (item) => {
        this.selectedItems.delete(item);
        await this.render();
      },
      'toggle item selection',
      { multi: false, select: true },
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
      { multi: false, select: true },
    );

    this.addAction(
      'diagnosticPrev',
      async (items) => {
        const item = items ? items[0] : null;
        if (this instanceof FileSource) {
          const lineIndex = this.lines.findIndex(([, it]) => it === item);
          const prevIndex = findLast(this.diagnosisLineIndexes, (idx) => idx < lineIndex);
          if (prevIndex !== undefined) {
            await this.gotoLineIndex(prevIndex);
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = findLast(
          this.explorer.sources.slice(0, sourceIndex),
          (source) => source instanceof FileSource && source.diagnosisLineIndexes.length > 0,
        ) as undefined | FileSource;
        if (fileSource) {
          const prevIndex = fileSource.diagnosisLineIndexes[fileSource.diagnosisLineIndexes.length - 1];
          if (prevIndex !== undefined) {
            await fileSource.gotoLineIndex(prevIndex);
          }
        }
      },
      'go to previous diagnostic',
    );

    this.addAction(
      'diagnosticNext',
      async (items) => {
        const item = items ? items[0] : null;
        if (this instanceof FileSource) {
          const lineIndex = this.lines.findIndex(([, it]) => it === item);
          const nextIndex = this.diagnosisLineIndexes.find((idx) => idx > lineIndex);
          if (nextIndex !== undefined) {
            await this.gotoLineIndex(nextIndex);
            return;
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = this.explorer.sources
          .slice(sourceIndex + 1)
          .find((source) => source instanceof FileSource && source.diagnosisLineIndexes.length > 0) as
          | undefined
          | FileSource;
        if (fileSource) {
          const nextIndex = fileSource.diagnosisLineIndexes[0];
          if (nextIndex !== undefined) {
            await fileSource.gotoLineIndex(nextIndex);
          }
        }
      },
      'go to next diagnostic',
    );

    this.addAction(
      'gitPrev',
      async (items) => {
        const item = items ? items[0] : null;
        if (this instanceof FileSource) {
          const lineIndex = this.lines.findIndex(([, it]) => it === item);
          const prevIndex = findLast(this.gitChangedLineIndexes, (idx) => idx < lineIndex);
          if (prevIndex !== undefined) {
            await this.gotoLineIndex(prevIndex);
            return;
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = findLast(
          this.explorer.sources.slice(0, sourceIndex),
          (source) => source instanceof FileSource && source.gitChangedLineIndexes.length > 0,
        ) as undefined | FileSource;
        if (fileSource) {
          const prevIndex = fileSource.gitChangedLineIndexes[fileSource.gitChangedLineIndexes.length - 1];
          if (prevIndex !== undefined) {
            await fileSource.gotoLineIndex(prevIndex);
          }
        }
      },
      'go to previous git changed',
    );

    this.addAction(
      'gitNext',
      async (items) => {
        const item = items ? items[0] : null;
        if (this instanceof FileSource) {
          const lineIndex = this.lines.findIndex(([, it]) => it === item);
          const nextIndex = this.gitChangedLineIndexes.find((idx) => idx > lineIndex);
          if (nextIndex !== undefined) {
            await this.gotoLineIndex(nextIndex);
            return;
          }
        }
        const sourceIndex = this.explorer.sources.findIndex((s) => s === this);
        const fileSource = this.explorer.sources
          .slice(sourceIndex + 1)
          .find((source) => source instanceof FileSource && source.gitChangedLineIndexes.length > 0) as
          | undefined
          | FileSource;
        if (fileSource) {
          const nextIndex = fileSource.gitChangedLineIndexes[0];
          if (nextIndex !== undefined) {
            await fileSource.gotoLineIndex(nextIndex);
          }
        }
      },
      'go to next git changed',
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

  /**
   * @returns winnr
   */
  async prevWinnr() {
    const winnr = (await this.nvim.call('bufwinnr', [this.explorer.previousBufnr])) as number;
    if ((await this.explorer.winnr) !== winnr && winnr > 0) {
      return winnr;
    } else {
      return null;
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

    const { multi = true, render = false, reload = false, select = false } = action.options;

    const finalItems = Array.isArray(items) ? items : [items];
    if (select) {
      await action.callback(finalItems, arg);
    } else if (multi) {
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

  getItemByIndex(lineIndex: number) {
    const line = this.lines[lineIndex];
    return line ? line[1] : null;
  }

  async gotoLineIndex(lineIndex: number, col?: number, notify = false) {
    await execNotifyBlock(async () => {
      const finalCol = col === undefined ? await this.explorer.currentCol() : col;
      const win = await this.explorer.win;
      if (win) {
        if (lineIndex >= this.lines.length) {
          lineIndex = this.lines.length - 1;
        }
        win.setCursor([this.startLine + lineIndex + 1, finalCol - 1], true);
        if (workspace.env.isVim) {
          this.nvim.command('redraw', true);
        }
      }
    }, notify);
  }

  async gotoRoot({ col, notify = false }: { col?: number; notify?: boolean } = {}) {
    const finalCol = col === undefined ? await this.explorer.currentCol() : col;
    await this.gotoLineIndex(0, finalCol, notify);
  }

  async gotoItem(
    item: Item | null,
    { lineIndex: fallbackLineIndex, col, notify = false }: { lineIndex?: number; col?: number; notify?: boolean } = {},
  ) {
    if (item === null) {
      await this.gotoRoot({ col, notify });
      return;
    }

    const finalCol = col === undefined ? await this.explorer.currentCol() : col;
    const lineIndex = this.lines.findIndex(([, it]) => it !== null && it.uid === item.uid);
    if (lineIndex !== -1) {
      await this.gotoLineIndex(lineIndex, finalCol, notify);
    } else if (fallbackLineIndex !== undefined) {
      await this.gotoLineIndex(fallbackLineIndex, finalCol, notify);
    } else {
      await this.gotoRoot({ col: finalCol, notify });
    }
  }

  abstract loadItems(sourceItem: null | Item): Promise<Item[]>;
  abstract draw(builder: SourceViewBuilder<Item>): void | Promise<void>;
  async loaded(_sourceItem: null | Item): Promise<void> {}

  async reload(
    sourceItem: null | Item,
    { render = true, notify = false }: { buffer?: Buffer; render?: boolean; notify?: boolean } = {},
  ) {
    this.selectedItems = new Set();
    this.items = await this.loadItems(sourceItem);
    await this.loaded(sourceItem);
    if (render) {
      await this.render({ notify });
    }
  }

  async render({ notify = false, storeCursor = true }: { notify?: boolean; storeCursor?: boolean } = {}) {
    if (this.explorer.isHelpUI) {
      return;
    }

    const { nvim } = this;

    let restore: (() => Promise<void>) | null = null;
    if (storeCursor) {
      restore = await this.explorer.storeCursor();
    }

    await execNotifyBlock(async () => {
      const builder = new SourceViewBuilder<Item>();
      await this.draw(builder);
      this.lines = builder.lines;
      await this.partRender(true);

      if (restore) {
        await restore();
      }

      if (workspace.env.isVim) {
        nvim.command('redraw', true);
      }
    }, notify);
  }

  private async partRender(notify = false) {
    await execNotifyBlock(async () => {
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
    }, notify);
  }

  /**
   * select windows from current tabpage
   */
  async selectWindowsUI(
    selected: (winnr: number) => void | Promise<void>,
    nothingChoice: () => void | Promise<void> = () => {},
  ) {
    const winnr = await this.nvim.call('coc_explorer#select_wins', [
      this.explorer.name,
      config.get<boolean>('openAction.select.filterFloatWindows')!,
    ]);
    if (winnr > 0) {
      await Promise.resolve(selected(winnr));
    } else if (winnr == 0) {
      await Promise.resolve(nothingChoice());
    }
  }

  async renderHelp(isRoot: boolean) {
    this.explorer.isHelpUI = true;
    const builder = new SourceViewBuilder<null>();
    const width = await this.nvim.call('winwidth', '%');
    const storeCursor = await this.explorer.storeCursor();

    builder.newItem(null, (row) => {
      row.add(`Help for [${this.name}${isRoot ? ' root' : ''}], (use q or <esc> return to explorer)`);
    });
    builder.newItem(null, (row) => {
      row.add('—'.repeat(width), helpHightlights.line);
    });

    const registeredActions = isRoot ? this.rootActions : this.actions;
    const drawAction = (row: SourceRowBuilder, action: Action) => {
      row.add(action.name, helpHightlights.action);
      if (action.arg) {
        row.add(`(${action.arg})`, helpHightlights.arg);
      }
      row.add(' ');
      row.add(registeredActions[action.name].description, helpHightlights.description);
    };
    Object.entries(mappings).forEach(([key, actions]) => {
      if (!actions.every((action) => action.name in registeredActions)) {
        return;
      }
      builder.newItem(null, (row) => {
        row.add(' ');
        row.add(key, helpHightlights.mappingKey);
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

    await execNotifyBlock(async () => {
      await this.explorer.setLines(builder.lines.map(([content]) => content), 0, -1, true);
    });

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

    await this.quitHelp();
    await this.explorer.renderAll({ storeCursor: false });
    await storeCursor();
  }

  async quitHelp() {
    await this.explorer.executeMappings();
    this.explorer.isHelpUI = false;
  }
}

import { FileSource } from './sources/file/file-source';
