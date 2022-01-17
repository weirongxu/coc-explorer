import { Notifier } from 'coc-helper';
import { Mutex } from 'coc.nvim';
import { Explorer } from '../explorer';
import { BaseTreeNode } from '../source/source';
import { RendererSource, rendererSourceSymbol } from './rendererSource';
import { ViewExplorer } from './viewExplorer';

export const rendererExplorerSymbol = Symbol('rendererExplorer');

export class RendererExplorer {
  private renderMutex = new Mutex();

  constructor(
    private readonly view: ViewExplorer,
    private readonly explorer: Explorer = view.explorer,
  ) {}

  async runQueue<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.renderMutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  rendererSources(): RendererSource<BaseTreeNode<any, string>>[] {
    return this.explorer.sources.map((s) => s.view[rendererSourceSymbol]);
  }

  async renderAllNotifier() {
    const notifiers = await Promise.all(
      this.rendererSources().map((s) => s.renderNotifier({ force: true })),
    );

    return Notifier.combine(notifiers);
  }
}
