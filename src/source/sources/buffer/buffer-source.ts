import { workspace } from 'coc.nvim';
import pathLib from 'path';
import {
  getActiveMode,
  onBufEnter,
  debounce,
  normalizePath,
  onEvents,
  config,
} from '../../../util';
import { hlGroupManager } from '../../highlight-manager';
import { ExplorerSource, BaseTreeNode } from '../../source';
import { sourceManager } from '../../source-manager';
import { bufferColumnRegistrar } from './buffer-column-registrar';
import './load';
import { initBufferActions } from './buffer-actions';
import { argOptions } from '../../../parse-args';
import { TemplateRenderer } from '../../template-renderer';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufferNode extends BaseTreeNode<BufferNode, 'root' | 'child'> {
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
  scheme = 'buf';
  hlSrcId = workspace.createNameSpace('coc-explorer-buffer');
  showHidden: boolean = config.get<boolean>('file.showHiddenBuffers')!;
  rootNode: BufferNode = {
    type: 'root',
    isRoot: true,
    uri: this.helper.generateUri('/'),
    level: 0,
    drawnLine: '',
    expandable: true,
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
  templateRenderer: TemplateRenderer<BufferNode> = new TemplateRenderer<BufferNode>(
    this,
    bufferColumnRegistrar,
  );

  async init() {
    if (getActiveMode()) {
      if (workspace.isNvim) {
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
    await this.templateRenderer.parse(
      'root',
      await this.explorer.args.value(argOptions.bufferRootTemplate),
    );
    await this.templateRenderer.parse(
      'child',
      await this.explorer.args.value(argOptions.bufferChildTemplate),
      await this.explorer.args.value(argOptions.bufferChildLabelingTemplate),
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
      const fullpath = pathLib.resolve(normalizePath(bufname));
      res.push({
        type: 'child',
        uri: this.helper.generateUri(`${fullpath}?bufnr=${bufnr}`),
        level: 1,
        drawnLine: '',
        parent: this.rootNode,
        bufnr: parseInt(bufnr),
        bufnrStr: bufnr,
        bufname,
        fullpath,
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

  async drawNode(node: BufferNode, nodeIndex: number) {
    await this.viewBuilder.drawRowForNode(node, async (row) => {
      await this.templateRenderer.draw(row, node, nodeIndex);
    });
  }
}

sourceManager.registerSource('buffer', BufferSource);
