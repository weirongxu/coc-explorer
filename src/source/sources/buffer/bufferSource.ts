import { workspace } from 'coc.nvim';
import { onBufEnter, debounce, config, uniq } from '../../../util';
import { hlGroupManager } from '../../highlightManager';
import { ExplorerSource, BaseTreeNode } from '../../source';
import { sourceManager } from '../../sourceManager';
import { bufferColumnRegistrar } from './bufferColumnRegistrar';
import './load';
import { initBufferActions } from './bufferActions';
import { TemplateRenderer } from '../../templateRenderer';
import { argOptions } from '../../../argOptions';

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
  hlSrcId = workspace.createNameSpace('coc-explorer-buffer');
  showHidden: boolean = config.get<boolean>('file.showHiddenBuffers')!;
  rootNode: BufferNode = {
    type: 'root',
    isRoot: true,
    level: 0,
    drawnLine: '',
    expandable: true,
    uid: this.helper.getUid('0'),
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
  templateRenderer: TemplateRenderer<BufferNode> = new TemplateRenderer<
    BufferNode
  >(this, bufferColumnRegistrar);

  async init() {
    if (this.config.activeMode) {
      if (workspace.isNvim) {
        this.subscriptions.push(
          this.bufManager.onReload(
            debounce(500, async () => {
              await this.reload(this.rootNode);
            }),
          ),
          this.bufManager.onModified(
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

  async loadChildren(_parentNode: BufferNode, { force = false } = {}) {
    if (force) {
      await this.bufManager.reload();
    }
    const list = this.bufManager.list;
    const tabOnly = config.get<boolean>('buffer.tabOnly')!;
    let newList: BufferNode[];
    if (this.showHidden) {
      newList = [...list];
    } else {
      if (tabOnly) {
        const tabBuflist: number[] = uniq(
          await this.nvim.call('tabpagebuflist', []),
        );
        newList = list.filter(
          (it) => tabBuflist.includes(it.bufnr) && !it.unlisted,
        );
      } else {
        newList = list.filter((it) => !it.unlisted);
      }
    }
    return newList.map((it) => ({
      ...it,
      parent: this.rootNode,
    }));
  }

  async drawNode(node: BufferNode, nodeIndex: number) {
    await this.viewBuilder.drawRowForNode(node, async (row) => {
      await this.templateRenderer.draw(row, node, nodeIndex);
    });
  }
}

sourceManager.registerSource('buffer', BufferSource);
