import { workspace, events } from 'coc.nvim';
import pathLib from 'path';
import { ExplorerSource } from '../..';
import { hlGroupManager } from '../../highlight-manager';
import { sourceManager } from '../../source-manager';
import { SourceViewBuilder } from '../../view-builder';
import { bufferColumnManager } from './column-manager';
import './load';
import { config, openStrategy, activeMode, supportBufferHighlight } from '../../../util';
import { debounce } from 'throttle-debounce';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufferItem {
  uid: string;
  bufnr: number;
  bufname: string;
  basename: string;
  unlisted: boolean;
  current: boolean;
  previous: boolean;
  visible: boolean;
  hidden: boolean;
  modifiable: boolean;
  readonly: boolean;
  terminal: boolean;
  modified: boolean;
  readErrors: boolean;
}

const hl = hlGroupManager.hlLinkGroupCommand;

const highlights = {
  title: hl('BufferRoot', 'Identifier'),
  expandIcon: hl('BufferExpandIcon', 'Special'),
};

hlGroupManager.register(highlights);

export class BufferSource extends ExplorerSource<BufferItem> {
  name = 'buffer';
  hlSrcId = workspace.createNameSpace('coc-explorer-buffer');
  showHiddenBuffers: boolean = config.get<boolean>('buffer.showHiddenBuffers')!;

  async init() {
    const { nvim } = this;

    await bufferColumnManager.init(this);

    if (activeMode) {
      setTimeout(() => {
        if (workspace.env.isVim) {
          if (supportBufferHighlight()) {
            events.on(
              'BufEnter',
              debounce(500, async (bufnr) => {
                if (bufnr === this.explorer.bufnr) {
                  await this.reload(null);
                }
              }),
            );
          }
        } else {
          events.on(
            ['BufCreate', 'BufHidden', 'BufUnload'],
            debounce(500, async () => {
              await this.reload(null);
            }),
          );
        }
      }, 30);
    }

    this.addAction(
      'toggleHidden',
      async () => {
        this.showHiddenBuffers = !this.showHiddenBuffers;
      },
      'expand root node',
      { reload: true },
    );
    this.addAction(
      'shrink',
      async () => {
        this.expanded = false;
        await this.reload(null);
      },
      'shrink root node',
    );
    this.addRootAction(
      'expand',
      async () => {
        this.expanded = true;
        await this.reload(null);
      },
      'expand root node',
    );

    this.addItemsAction(
      'expand',
      async (items) => {
        await this.doAction('open', items);
      },
      'open buffer',
    );
    this.addItemAction(
      'open',
      async (item) => {
        if (openStrategy === 'vsplit') {
          await this.doAction('openInVsplit', item);
        } else if (openStrategy === 'select') {
          await this.selectWindowsUI(
            async (winnr) => {
              await this.nvim.command(`${winnr}wincmd w`);
              await nvim.command(`buffer ${item.bufnr}`);
            },
            async () => {
              await this.doAction('openInVsplit', item);
            },
          );
        } else if (openStrategy === 'previousBuffer') {
          if (await this.gotoPrevWin()) {
            await nvim.command(`buffer ${item.bufnr}`);
          } else {
            await this.doAction('openInVsplit', item);
          }
        }
      },
      'open buffer',
      { multi: false },
    );
    this.addItemAction(
      'drop',
      async (item) => {
        if (!item.hidden) {
          const info = (await nvim.call('getbufinfo', item.bufnr)) as any[];
          if (info.length && info[0].windows.length) {
            const winid = info[0].windows[0];
            await nvim.call('win_gotoid', winid);
            return;
          }
        }
        await nvim.command(`buffer ${item.bufnr}`);
      },
      'open buffer via drop command',
      { multi: false },
    );
    this.addItemAction(
      'openInTab',
      async (item) => {
        const escaped = await nvim.call('fnameescape', item.bufname);
        await nvim.command(`tabe ${escaped}`);
      },
      'open buffer via tab',
    );
    this.addItemAction(
      'openInSplit',
      async (item) => {
        await nvim.command(`sbuffer ${item.bufnr}`);
      },
      'open buffer via split command',
    );
    this.addItemAction(
      'openInVsplit',
      async (item) => {
        await nvim.command(`vertical sbuffer ${item.bufnr}`);
        const winnr = await nvim.call('winnr');
        if (this.explorer.position === 'left') {
          if (winnr === 1) {
            await nvim.command('wincmd L');
          }
        } else {
          const lastWinid = (await nvim.call('winnr', '$')) as number;
          if (winnr === lastWinid) {
            await nvim.command('wincmd H');
          }
        }
      },
      'open buffer via vsplit command',
    );

    this.addItemAction(
      'delete',
      async (item) => {
        await nvim.command(`bdelete ${item.bufnr}`);
      },
      'delete buffer',
      { reload: true },
    );
    this.addItemAction(
      'deleteForever',
      async (item) => {
        await nvim.command(`bwipeout ${item.bufnr}`);
      },
      'bwipeout buffer',
      {
        reload: true,
      },
    );
  }

  async loadItems() {
    if (!this.expanded) {
      return [];
    }

    const { nvim } = this;
    const lsCommand = this.showHiddenBuffers ? 'ls!' : 'ls';
    const content = (await nvim.call('execute', lsCommand)) as string;

    return content.split(/\n/).reduce<BufferItem[]>((res, line) => {
      const matches = line.match(regex);
      if (!matches) {
        return res;
      }

      const bufnr = parseInt(matches[1]);
      const flags = matches[2];
      const bufname = matches[3];
      res.push({
        uid: this.name + '_' + bufnr,
        bufnr,
        bufname,
        basename: pathLib.basename(bufname),
        unlisted: flags.includes('u'),
        current: flags.includes('%'),
        previous: flags.includes('#'),
        visible: flags.includes('a'),
        hidden: flags.includes('h'),
        modifiable: !flags.includes('-'),
        readonly: flags.includes('='),
        terminal: flags.includes('R') || flags.includes('F') || flags.includes('?'),
        modified: flags.includes('+'),
        readErrors: flags.includes('x'),
      });
      return res;
    }, []);
  }

  async loaded(item: BufferItem) {
    await bufferColumnManager.load(item);
  }

  draw(builder: SourceViewBuilder<BufferItem>) {
    bufferColumnManager.beforeDraw();

    builder.newRoot((row) => {
      row.add(this.expanded ? '-' : '+', highlights.expandIcon.group);
      row.add(' ');
      row.add(`[BUFFER${this.showHiddenBuffers ? ' I' : ''}]`, highlights.title.group);
    });
    for (const item of this.items) {
      builder.newItem(item, (row) => {
        row.add('  ');
        bufferColumnManager.drawItem(row, item);
      });
    }
  }
}

sourceManager.registerSource(new BufferSource());
