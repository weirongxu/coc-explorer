import { events, workspace } from 'coc.nvim';
import pathLib from 'path';
import { activeMode, config, onBufEnter, debounce, normalizePath } from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, sourceIcons } from '../../source';
import { sourceManager } from '../../source-manager';
import { bufferColumnManager } from './column-manager';
import './load';
import { initBufferActions } from './buffer-actions';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufferNode {
  uid: string | null;
  level: number;
  drawnLine: string;
  parent?: BufferNode;
  children?: BufferNode[];
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

export class BufferSource extends ExplorerSource<BufferNode> {
  name = 'buffer';
  hlSrcId = workspace.createNameSpace('coc-explorer-buffer');
  showHiddenBuffers: boolean = config.get<boolean>('buffer.showHiddenBuffers')!;
  rootNode = {
    uid: null,
    level: 0,
    drawnLine: '',
    children: [] as BufferNode[],
    bufnr: 0,
    bufnrStr: '0',
    bufname: '',
    fullpath: '',
    basename: '',
    unlisted: true,
    current: false,
    previous: false,
    visible: false,
    hidden: false,
    modifiable: false,
    readonly: true,
    terminal: false,
    modified: false,
    readErrors: false,
  };

  async init() {
    const { nvim } = this;

    await bufferColumnManager.init(this);

    if (activeMode) {
      this.explorer.emitterDidInit.event(() => {
        if (!workspace.env.isVim) {
          events.on(
            ['BufCreate', 'BufHidden', 'BufUnload', 'BufWritePost', 'InsertLeave'],
            debounce(500, async () => {
              await this.reload(this.rootNode);
            }),
          );
        } else {
          onBufEnter(500, async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.reload(this.rootNode, { render: false });
            }
          });
        }
      });
    }

    initBufferActions(this);
  }

  async loadChildren() {
    const { nvim } = this;
    const lsCommand = this.showHiddenBuffers ? 'ls!' : 'ls';
    const content = (await nvim.call('execute', lsCommand)) as string;

    return content.split(/\n/).reduce<BufferNode[]>((res, line) => {
      const matches = line.match(regex);
      if (!matches) {
        return res;
      }

      const bufnr = matches[1];
      const flags = matches[2];
      const bufname = matches[3];
      res.push({
        uid: this.name + '-' + bufnr,
        level: 1,
        drawnLine: '',
        parent: this.rootNode,
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

  async loaded(sourceNode: BufferNode) {
    await bufferColumnManager.load(sourceNode);
  }

  async beforeDraw(nodes: BufferNode[]) {
    return await bufferColumnManager.beforeDraw(nodes);
  }

  drawNode(node: BufferNode) {
    if (!node.parent) {
      node.drawnLine = this.viewBuilder.drawLine((row) => {
        row.add(this.expanded ? sourceIcons.expanded : sourceIcons.shrinked, highlights.expandIcon);
        row.add(' ');
        row.add(`[BUFFER${this.showHidden ? ' I' : ''}]`, highlights.title);
      });
    } else {
      node.drawnLine = this.viewBuilder.drawLine((row) => {
        row.add('  ');
        bufferColumnManager.drawNode(row, node);
      });
    }
  }
}

sourceManager.registerSource(new BufferSource());
