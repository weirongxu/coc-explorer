import { BufferHighlight } from '@chemzqm/neovim';
import { Disposable, disposeAll, workspace } from 'coc.nvim';
import { Location, Range } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { argOptions } from '../argOptions';
import { onBufEnter, onCursorMoved, onEvent } from '../events';
import { Explorer } from '../explorer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { FloatingOpenOptions } from '../types';
import { PreviewActionStrategy } from '../types/pkg-config';
import {
  byteLength,
  Drawn,
  flatten,
  max,
  min,
  onError,
  readFileLines,
  supportedFloat,
} from '../util';
import { FloatingWindow } from './floatingWindow';

type PreviewArguments = {
  lines: string[];
  highlights?: BufferHighlight[];
  options?: {
    filetype?: string;
    filepath?: string;
  };
};

type PreviewAction = (options: {
  source: ExplorerSource<any>;
  node: BaseTreeNode<any>;
  nodeIndex: number;
}) => void | PreviewArguments | Promise<PreviewArguments | void>;

export class FloatingPreview implements Disposable {
  nvim = workspace.nvim;
  shown: boolean = false;
  disposables: Disposable[] = [];
  maxHeight = 30;
  preferTop = false;

  private onHoverStrategy: false | PreviewActionStrategy = false;

  constructor(public explorer: Explorer) {
    this.disposables.push(
      onEvent('BufWinLeave', async (bufnr) => {
        if (bufnr === this.explorer.bufnr) {
          await this.close();
        }
      }),
      onBufEnter(async (bufnr) => {
        if (
          bufnr !== this.explorer.bufnr &&
          bufnr !== this.previewWindowStore?.bufnr
        ) {
          await this.close();
        }
      }, 300),
      onCursorMoved(async (bufnr) => {
        if (this.onHoverStrategy || bufnr !== this.explorer.bufnr) {
          return;
        }
        await this.close();
      }, 300),
      Disposable.create(() => {
        disposeAll(this.onHoverDisposables);
      }),
    );

    this.registerActions();

    const onHover = explorer.config.get('previewAction.onHover');
    if (!onHover) {
      return;
    }
    if (Array.isArray(onHover)) {
      this.registerOnHover(onHover[0], onHover[1]);
    } else {
      this.registerOnHover(onHover);
    }
  }

  dispose() {
    this.previewWindowStore?.dispose();
  }

  private previewWindowStore: FloatingWindow | undefined;
  private async getPreviewWindow() {
    if (!this.previewWindowStore) {
      this.previewWindowStore = await FloatingWindow.create();
    }
    return this.previewWindowStore;
  }

  async close() {
    await this.previewWindowStore?.close();
  }

  private onHoverDisposables: Disposable[] = [];

  toggleOnHover(onHoverStrategy: PreviewActionStrategy, delay?: number) {
    if (this.onHoverStrategy === onHoverStrategy) {
      this.unregisterOnHover();
    } else {
      this.registerOnHover(onHoverStrategy, delay);
    }
  }

  registerOnHover(onHoverStrategy: PreviewActionStrategy, delay: number = 300) {
    if (this.onHoverStrategy === onHoverStrategy) {
      return;
    }
    this.onHoverStrategy = onHoverStrategy;

    disposeAll(this.onHoverDisposables);
    this.onHoverDisposables = [];

    const onHover = async (bufnr: number) => {
      if (bufnr !== this.explorer.bufnr) {
        return;
      }
      await this.close();

      await this.explorer.refreshLineIndex();

      const source = await this.explorer.currentSource();
      if (!source) {
        return;
      }

      const node = source.currentNode();
      if (!node) {
        return;
      }
      const nodeIndex = source.getLineByNode(node);
      if (nodeIndex === undefined) {
        return;
      }
      await this.previewNode(onHoverStrategy, source, node, nodeIndex);
    };

    this.onHoverDisposables.push(
      onCursorMoved(onHover, delay),
      onBufEnter(onHover, delay),
    );

    onHover(workspace.bufnr).catch(onError);

    // eslint-disable-next-line no-restricted-properties
    workspace.showMessage(`Preivew ${onHoverStrategy} enabled`);
  }

  unregisterOnHover() {
    if (!this.onHoverStrategy) {
      return;
    }
    this.onHoverStrategy = false;
    disposeAll(this.onHoverDisposables);
    this.onHoverDisposables = [];

    this.close().catch(onError);

    // eslint-disable-next-line no-restricted-properties
    workspace.showMessage('Preview disabled ');
  }

  private registeredPreviewActions: Record<string, PreviewAction> = {};
  public registerAction(name: string, action: PreviewAction) {
    this.registeredPreviewActions[name] = action;
  }

  registerActions() {
    this.registerAction('labeling', async ({ source, node, nodeIndex }) => {
      const drawnList:
        | Drawn[]
        | undefined = await source.sourcePainters?.drawNodeLabeling(
        node,
        nodeIndex,
      );
      if (!drawnList || !this.explorer.explorerManager.inExplorer()) {
        return;
      }

      return {
        lines: drawnList.map((d) => d.content),
        highlights: flatten(
          drawnList.map((d, index) =>
            d.highlightPositions.map((hl) => ({
              hlGroup: hl.group,
              line: index,
              colStart: hl.start,
              colEnd: hl.start + hl.size,
            })),
          ),
        ),
        options: {
          filetype: 'coc-explorer-labeling',
        },
      };
    });

    this.registerAction('content', async ({ node }) => {
      if (node.expandable) {
        return;
      }

      let location: Location | undefined;
      if (node.location) {
        location = node.location;
      } else if (node.fullpath) {
        location = Location.create(node.fullpath, Range.create(0, 0, 0, 0));
      } else {
        return;
      }
      const { uri: locUri, range } = location;
      const doc = workspace.getDocument(locUri);
      const uri = URI.parse(locUri);
      const lines = doc
        ? doc.getLines(0, range.end.line + this.maxHeight)
        : await readFileLines(uri.fsPath, 0, range.end.line + 30);

      return {
        lines,
        highlights: [],
        options: { filepath: uri.fsPath },
      };
    });
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

  private async getFloatOptions(
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
      ...this.borderOptions(),
    };
  }

  async previewNode(
    previewStrategy: PreviewActionStrategy,
    source: ExplorerSource<any>,
    node: BaseTreeNode<any>,
    nodeIndex: number,
  ) {
    if (!supportedFloat()) {
      return;
    }

    if (!this.registeredPreviewActions[previewStrategy]) {
      return;
    }

    const openArgs = await this.registeredPreviewActions[previewStrategy]({
      source,
      node,
      nodeIndex,
    });
    if (!openArgs) {
      return;
    }

    const previewWindow = await this.getPreviewWindow();

    const floatOptions = await this.getFloatOptions(openArgs.lines);
    if (!floatOptions) {
      return;
    }

    await previewWindow.open(openArgs.lines, openArgs.highlights ?? [], {
      ...floatOptions,
      ...openArgs.options,
    });
  }
}
