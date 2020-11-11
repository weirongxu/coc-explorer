import { workspace } from 'coc.nvim';
import { debounce, uniq } from '../../../util';
import { hlGroupManager } from '../../highlights/highlightManager';
import { ExplorerSource, BaseTreeNode } from '../../source';
import { sourceManager } from '../../sourceManager';
import { bufferColumnRegistrar } from './bufferColumnRegistrar';
import './load';
import { initBufferActions } from './bufferActions';
import { SourcePainters } from '../../sourcePainters';
import { argOptions } from '../../../argOptions';
import { onBufEnter } from '../../../events';
import { bufferArgOptions } from './argOptions';

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
  hidden: hl('BufferHidden', 'Comment'),
  expandIcon: hl('BufferExpandIcon', 'Directory'),
  nameVisible: hl('BufferNameVisible', 'String'),
  bufname: hl('BufferBufname', 'Comment'),
  modified: hl('BufferModified', 'Operator'),
  bufnr: hl('BufferBufnr', 'Special'),
  readonly: hl('BufferReadonly', 'Operator'),
  fullpath: hl('BufferFullpath', 'Comment'),
};

export class BufferSource extends ExplorerSource<BufferNode> {
  hlSrcId = workspace.createNameSpace('coc-explorer-buffer');
  showHidden: boolean = this.config.get<boolean>('file.showHiddenBuffers')!;
  rootNode: BufferNode = {
    type: 'root',
    isRoot: true,
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
  sourcePainters: SourcePainters<BufferNode> = new SourcePainters<BufferNode>(
    this,
    bufferColumnRegistrar,
  );

  async init() {
    if (this.config.get('activeMode')) {
      if (workspace.isNvim) {
        this.disposables.push(
          this.bufManager.onReload(
            debounce(500, async () => {
              await this.load(this.rootNode);
            }),
          ),
          this.bufManager.onModified(
            debounce(500, async () => {
              await this.load(this.rootNode);
            }),
          ),
        );
      } else {
        this.disposables.push(
          onBufEnter(async (bufnr) => {
            if (bufnr === this.explorer.bufnr) {
              await this.load(this.rootNode, { render: false });
            }
          }, 500),
        );
      }
    }

    initBufferActions(this);
  }

  async open() {
    await this.sourcePainters.parseTemplate(
      'root',
      await this.explorer.args.value(bufferArgOptions.bufferRootTemplate),
    );
    await this.sourcePainters.parseTemplate(
      'child',
      await this.explorer.args.value(bufferArgOptions.bufferChildTemplate),
      await this.explorer.args.value(
        bufferArgOptions.bufferChildLabelingTemplate,
      ),
    );
  }

  async loadChildren(_parentNode: BufferNode, { force = false } = {}) {
    if (force) {
      await this.bufManager.reload();
    }
    const bufferNodes = this.bufManager.bufferNodes;
    const tabOnly = this.config.get<boolean>('buffer.tabOnly')!;
    if (this.showHidden) {
      return [...bufferNodes];
    } else {
      if (tabOnly) {
        const tabBuflist: number[] = uniq(
          await this.nvim.call('tabpagebuflist', []),
        );
        return bufferNodes.filter(
          (it) => tabBuflist.includes(it.bufnr) && !it.unlisted,
        );
      } else {
        return bufferNodes.filter((it) => !it.unlisted);
      }
    }
  }
}

sourceManager.registerSource('buffer', BufferSource);
