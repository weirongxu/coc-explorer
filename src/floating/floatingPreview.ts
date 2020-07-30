import { workspace, Disposable } from 'coc.nvim';
import { Explorer } from '../explorer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { Drawn, flatten, supportedFloat, max, min, byteLength } from '../util';
import { PreviewStrategy, FloatingOpenOptions } from '../types';
import { argOptions } from '../argOptions';
import { FloatingWindow } from './floatingWindow';
import { onEvent, onBufEnter, onCursorMoved } from '../events';

export class FloatingPreview implements Disposable {
  nvim = workspace.nvim;
  shown: boolean = false;
  disposables: Disposable[] = [];
  maxHeight = 30;
  preferTop = false;

  private _previewNodeTimeout?: NodeJS.Timeout;
  private labelingWindow: FloatingWindow | undefined;
  private onHover: boolean;

  constructor(public explorer: Explorer) {
    this.onHover = this.explorer.config.get('previewAction.onHover');

    this.disposables.push(
      onEvent('BufWinLeave', async (bufnr) => {
        if (bufnr === this.explorer.bufnr) {
          await this.labelingWindow?.close();
        }
      }),
      onBufEnter(async (bufnr) => {
        if (bufnr !== this.explorer.bufnr) {
          await this.labelingWindow?.close();
        }
      }, 300),
      onCursorMoved(async () => {
        if (workspace.bufnr === this.explorer.bufnr && this.onHover) {
          return;
        }
        await this.close();
      }, 300),
    );
  }

  dispose() {
    this.labelingWindow?.dispose();
  }

  async close() {
    await this.labelingWindow?.close();
  }

  borderOptions() {
    return {
      border_enable: false,
      border_chars: [],
      title: '',
    };
  }

  private getDimension(
    lines: string[],
    maxWidth: number,
    maxHeight: number,
  ): { width: number; height: number } {
    // width contains padding
    if (maxWidth === 0 || maxHeight === 0) {
      return { width: 0, height: 0 };
    }
    const lineLens: number[] = [];
    for (const line of lines) {
      lineLens.push(byteLength(line.replace(/\t/g, '  ')));
    }
    const width = min([max(lineLens), maxWidth]);
    if (width === undefined || width === 0) {
      return { width: 0, height: 0 };
    }
    let height = 0;
    for (const lineLen of lineLens) {
      height = height + Math.max(Math.ceil(lineLen / width), 1);
    }
    return { width, height: Math.min(height, maxHeight) };
  }

  private async labelingOptions(
    lines: string[],
  ): Promise<undefined | FloatingOpenOptions> {
    const env = workspace.env;
    const vimColumns = env.columns;
    const vimLines = env.lines - env.cmdheight - 1;
    const position = await this.explorer.args.value(argOptions.position);
    const isFloating = position === 'floating';
    const floatingPosition = await this.explorer.args.value(
      argOptions.floatingPosition,
    );
    const win = await this.explorer.win;
    if (!win) {
      return;
    }
    let alignTop: boolean = false;
    let winline = (await this.explorer.winline.get()) ?? 1;
    winline -= 1;
    const containerWin =
      isFloating && this.explorer.config.get('floating.border.enable')
        ? await this.explorer.borderWin
        : await this.explorer.win;
    if (!containerWin) {
      return;
    }
    let [winTop, winLeft]: [
      number,
      number,
    ] = await this.nvim.call('win_screenpos', [containerWin.id]);
    winTop -= 1;
    winLeft -= 1;
    const containerWidth = await containerWin.width;
    const maxWidth = vimColumns - containerWidth - (isFloating ? 0 : 1);
    const maxHeight = min([this.maxHeight, vimLines])!;

    const { width, height } = this.getDimension(lines, maxWidth, maxHeight);

    if (!this.preferTop) {
      if (vimLines - winline < height && winline > height) {
        alignTop = true;
      }
    } else {
      if (winline >= maxHeight || winline >= vimLines - winline) {
        alignTop = true;
      }
    }

    const top = winTop + (alignTop ? winline - height + 1 : winline);

    let left: number;
    if (position === 'left') {
      left = winLeft + containerWidth + 1;
    } else if (position === 'right') {
      left = winLeft - width - 1;
    } else if (isFloating && floatingPosition === 'left-center') {
      left = winLeft + containerWidth;
    } else if (isFloating && floatingPosition === 'right-center') {
      left = winLeft - width;
    } else {
      // TODO tab and floating other
      return;
    }

    return {
      top,
      left,
      width,
      height,
      filetype: 'coc-explorer-preview',
      ...this.borderOptions(),
    };
  }

  private async previewLabeling(
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
  ) {
    const drawnList:
      | Drawn[]
      | undefined = await source.sourcePainters?.drawNodeLabeling(
      node,
      nodeIndex,
    );
    if (!drawnList || !this.explorer.explorerManager.inExplorer()) {
      return;
    }

    if (!this.labelingWindow) {
      this.labelingWindow = await FloatingWindow.create();
    }

    const lines = drawnList.map((d) => d.content);
    const options = await this.labelingOptions(lines);
    if (!options) {
      return;
    }
    await this.labelingWindow.open(
      lines,
      flatten(
        drawnList.map((d, index) =>
          d.highlightPositions.map((hl) => ({
            hlGroup: hl.group,
            line: index,
            colStart: hl.start,
            colEnd: hl.start + hl.size,
          })),
        ),
      ),
      options,
    );
  }

  private async _previewNode(
    previewStrategy: PreviewStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
  ) {
    if (previewStrategy === 'labeling') {
      await this.previewLabeling(source, node, nodeIndex);
    }
  }

  async previewNode(
    previewStrategy: PreviewStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
    debounceTimeout: number = 0,
  ) {
    if (!supportedFloat()) {
      return;
    }

    if (this._previewNodeTimeout) {
      clearTimeout(this._previewNodeTimeout);
    }

    if (debounceTimeout) {
      this._previewNodeTimeout = setTimeout(async () => {
        await this._previewNode(previewStrategy, source, node, nodeIndex);
      }, debounceTimeout);
    } else {
      await this._previewNode(previewStrategy, source, node, nodeIndex);
    }
  }
}
