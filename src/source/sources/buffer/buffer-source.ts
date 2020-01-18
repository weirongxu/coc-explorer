import { workspace } from 'coc.nvim';
import pathLib from 'path';
import { activeMode, onBufEnter, debounce, normalizePath, onEvents } from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, sourceIcons } from '../../source';
import { sourceManager } from '../../source-manager';
import { bufferColumnRegistrar } from './buffer-column-registrar';
import './load';
import { initBufferActions } from './buffer-actions';
import { argOptions } from '../../../parse-args';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufferNode {
  isRoot?: boolean;
  uid: string;
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

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);

export const bufferHighlights = {
  title: hl('BufferRoot', 'Constant'),
  expandIcon: hl('BufferExpandIcon', 'Special'),
  nameVisible: hl('BufferNameVisible', 'String'),
  bufname: hl('BufferBufname', 'Comment'),
  modified: hl('BufferModified', 'Operator'),
  bufnr: hl('BufferBufnr', 'Special'),
  readonly: hl('BufferReadonly', 'Operator'),
  fullpath: hl('BufferFullpath', 'Comment'),
};

export class BufferSource extends ExplorerSource<BufferNode> {
  rootNode: BufferNode = {
    isRoot: true,
    uid: this.sourceName + '://',
    level: 0,
    drawnLine: '',
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
    if (activeMode) {
      if (!workspace.env.isVim) {
        this.subscriptions.push(
          onEvents(
            ['BufCreate', 'BufHidden', 'BufUnload', 'BufWritePost', 'InsertLeave'],
            debounce(500, async () => {
              await this.reload(this.rootNode);
            }),
          ),
        );
      } else {
        this.subscriptions.push(
          onBufEnter(async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.reload(this.rootNode, { render: false });
            }
          }, 500),
        );
      }
    }

    initBufferActions(this);
  }

  async open() {
    await this.columnManager.registerColumns(
      await this.explorer.args.value(argOptions.bufferColumns),
      bufferColumnRegistrar,
    );
  }

  async loadChildren() {
    const { nvim } = this;
    const lsCommand = this.showHidden ? 'ls!' : 'ls';
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
        uid: this.sourceName + '://' + bufnr,
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

  async drawRootNode(node: BufferNode) {
    node.drawnLine = await this.viewBuilder.drawRowLine(async (row) => {
      row.add(
        this.expanded ? sourceIcons.expanded : sourceIcons.collapsed,
        bufferHighlights.expandIcon,
      );
      row.add(' ');
      row.add(`[BUFFER${this.showHidden ? ' ' + sourceIcons.hidden : ''}]`, bufferHighlights.title);
    });
  }

  async drawNode(node: BufferNode, nodeIndex: number) {
    node.drawnLine = await this.viewBuilder.drawRowLine(async (row) => {
      row.add('  ');
      await this.columnManager.draw(row, node, nodeIndex);
    });
  }
}

sourceManager.registerSource('buffer', BufferSource);
