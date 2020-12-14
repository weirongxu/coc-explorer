import { Mutex } from 'await-semaphore';
import { Notifier } from 'coc-helper';
import { workspace } from 'coc.nvim';
import { Explorer } from '../explorer';
import { keyMapping } from '../mappings';
import { BaseTreeNode, ExplorerSource } from '../source/source';
import { MoveStrategy } from '../types';
import { enableWrapscan, onError, scanIndexNext, scanIndexPrev } from '../util';
import { ActionRegistrar } from './registrar';
import { ActionExp, MappingMode } from './types';

export class ActionExplorer extends ActionRegistrar<Explorer, any> {
  readonly actionMutex = new Mutex();
  readonly explorer = this.owner;
  readonly locator = this.explorer.locator;

  constructor(owner: Explorer) {
    super(owner);
  }

  async doActionByKey(key: string, mode: MappingMode, count: number = 1) {
    for (let c = 0; c < count; c++) {
      const selectedLineIndexes = await this.explorer.getSelectedOrCursorLineIndexes(
        mode,
      );
      const lineIndexesGroups = this.explorer.lineIndexesGroupBySource(
        selectedLineIndexes,
      );
      for (const { source, lineIndexes } of lineIndexesGroups) {
        const actionExp = keyMapping.getActionExp(source.sourceType, key);
        if (actionExp) {
          await this.doActionExp(actionExp, {
            mode,
            lineIndexes,
          });
        }
      }
    }
    const notifiers = await Promise.all(
      this.explorer.sources.map((source) =>
        source.view.emitRequestRenderNodesNotifier(),
      ),
    );
    await Notifier.runAll(notifiers);
  }

  async doActionExp(
    actionExp: ActionExp,
    options: {
      /**
       * @default 1
       */
      count?: number;
      /**
       * @default 'n'
       */
      mode?: MappingMode;
      lineIndexes?: Set<number> | number[];
    } = {},
  ) {
    const count = options.count ?? 1;
    const mode = options.mode ?? 'n';

    const firstLineIndexes = options.lineIndexes
      ? new Set(options.lineIndexes)
      : await this.explorer.getSelectedOrCursorLineIndexes(mode);

    try {
      for (let c = 0; c < count; c++) {
        const lineIndexes =
          c === 0
            ? firstLineIndexes
            : await this.explorer.getSelectedOrCursorLineIndexes(mode);

        const nodesGroup: Map<
          ExplorerSource<any>,
          BaseTreeNode<any>[]
        > = new Map();
        for (const lineIndex of lineIndexes) {
          const { source } = this.explorer.findSourceByLineIndex(lineIndex);
          if (!nodesGroup.has(source)) {
            nodesGroup.set(source, []);
          }
          const relativeLineIndex = lineIndex - source.view.startLineIndex;

          nodesGroup
            .get(source)!
            .push(source.view.flattenedNodes[relativeLineIndex]);
        }

        for (const [source, nodes] of nodesGroup.entries()) {
          await source.action.doActionExp(actionExp, nodes, { mode });
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        `Error when do action ${JSON.stringify(actionExp)}`,
        'error',
      );
      onError(error);
    }
  }

  async nodePrev(
    moveStrategy: MoveStrategy = 'default',
    condition: (it: BaseTreeNode<any>) => boolean,
  ) {
    const gotoPrev = async (
      nodes: BaseTreeNode<any>[],
      lineIndex: number,
      startLineIndex: number,
    ) => {
      const relativeIndex = scanIndexPrev(
        nodes,
        lineIndex,
        await enableWrapscan(),
        condition,
      );
      if (relativeIndex === undefined) {
        return;
      }
      await this.locator.gotoLineIndex(startLineIndex + relativeIndex);
    };

    if (moveStrategy === 'insideSource') {
      const source = await this.explorer.view.currentSource();
      if (!source) {
        return;
      }
      await gotoPrev(
        source.view.flattenedNodes,
        source.view.currentLineIndex,
        source.view.startLineIndex,
      );
    } else {
      await gotoPrev(
        this.explorer.view.flattenedNodes,
        this.explorer.view.currentLineIndex,
        0,
      );
    }
  }

  async nodeNext(
    moveStrategy: MoveStrategy = 'default',
    condition: (it: BaseTreeNode<any>) => boolean,
  ) {
    const gotoNext = async (
      nodes: BaseTreeNode<any>[],
      lineIndex: number,
      startLineIndex: number,
    ) => {
      const relativeIndex = scanIndexNext(
        nodes,
        lineIndex,
        await enableWrapscan(),
        condition,
      );
      if (relativeIndex === undefined) {
        return;
      }
      await this.locator.gotoLineIndex(startLineIndex + relativeIndex);
    };

    if (moveStrategy === 'insideSource') {
      const source = await this.explorer.view.currentSource();
      if (!source) {
        return;
      }
      await gotoNext(
        source.view.flattenedNodes,
        source.view.currentLineIndex,
        source.view.startLineIndex,
      );
    } else {
      await gotoNext(
        this.explorer.view.flattenedNodes,
        this.explorer.view.currentLineIndex,
        0,
      );
    }
  }
}
