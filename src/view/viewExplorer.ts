import { Notifier } from 'coc-helper';
import { Explorer } from '../explorer';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { RendererExplorer, rendererExplorerSymbol } from './rendererExplorer';

export class ViewExplorer {
  isHelpUI = false;
  currentLineIndex = 0;

  [rendererExplorerSymbol]: RendererExplorer;

  constructor(public readonly explorer: Explorer) {
    this[rendererExplorerSymbol] = new RendererExplorer(this);
  }

  async sync<T>(block: (renderer: RendererExplorer) => Promise<T>) {
    return await block(this[rendererExplorerSymbol]);
  }

  get flattenedNodes() {
    return this.explorer.sources.reduce<BaseTreeNode<any>[]>((ret, cur) => {
      return ret.concat(cur.view.flattenedNodes);
    }, []);
  }

  async refreshLineIndex() {
    const win = await this.explorer.win;
    if (win) {
      const cursor = await win.cursor;
      this.currentLineIndex = cursor[0] - 1;
    }
  }

  async currentSource(): Promise<
    ExplorerSource<BaseTreeNode<any>> | undefined
  > {
    return this.explorer.sources[await this.currentSourceIndex()];
  }

  async currentSourceIndex() {
    const lineIndex = this.currentLineIndex;
    return this.explorer.sources.findIndex(
      (source) =>
        lineIndex >= source.view.startLineIndex &&
        lineIndex < source.view.endLineIndex,
    );
  }

  async currentNode() {
    const source = await this.currentSource();
    if (source) {
      const nodeIndex = this.currentLineIndex - source.view.startLineIndex;
      return source.view.flattenedNodes[nodeIndex] as
        | BaseTreeNode<any, string>
        | undefined;
    }
  }

  async emitRequestRenderNodes() {
    await this.sync(async (r) => {
      const notifiers = await Promise.all(
        r.rendererSources().map((s) => s.emitRequestRenderNodesNotifier()),
      );

      await Notifier.runAll(notifiers);
    });
  }
}
