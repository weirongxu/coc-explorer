import { events, workspace } from 'coc.nvim';
import pathLib from 'path';
import { activeMode, config, onBufEnter, debounce, normalizePath } from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, sourceIcons } from '../../source';
import { sourceManager } from '../../source-manager';
import { SourceViewBuilder } from '../../view-builder';
import { bufferColumnManager } from './column-manager';
import './load';
import { initBufferActions } from './buffer-actions';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufferItem {
  uid: string;
  bufnr: number;
  bufnrStr: string;
  bufname: string;
  fullpath: string;
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

const hl = hlGroupManager.hlLinkGroupCommand.bind(hlGroupManager);

const highlights = {
  title: hl('BufferRoot', 'Constant'),
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
      this.explorer.onDidInit.event(() => {
        if (!workspace.env.isVim) {
          events.on(
            ['BufCreate', 'BufHidden', 'BufUnload', 'BufWritePost', 'InsertLeave'],
            debounce(500, async () => {
              await this.reload(null);
            }),
          );
        } else {
          onBufEnter(500, async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.reload(null, { render: false });
            }
          });
        }
      });
    }

    initBufferActions(this);
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

      const bufnr = matches[1];
      const flags = matches[2];
      const bufname = matches[3];
      res.push({
        uid: this.name + '-' + bufnr,
        bufnr: parseInt(bufnr),
        bufnrStr: bufnr,
        bufname,
        fullpath: pathLib.resolve(normalizePath(bufname)),
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

  async loaded(sourceItem: BufferItem) {
    await bufferColumnManager.load(sourceItem);
  }

  async draw(builder: SourceViewBuilder<BufferItem>) {
    await bufferColumnManager.beforeDraw();

    builder.newRoot((row) => {
      row.add(this.expanded ? sourceIcons.expanded : sourceIcons.shrinked, highlights.expandIcon);
      row.add(' ');
      row.add(`[BUFFER${this.showHiddenBuffers ? ' I' : ''}]`, highlights.title);
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
