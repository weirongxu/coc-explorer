import { SourceRowBuilder } from './view-builder';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';
import { HighlightConcealable } from './highlight-manager';

export interface Column<TreeNode extends BaseTreeNode<TreeNode>> {
  inited?: boolean;

  concealable?: HighlightConcealable;

  init?(): void | Promise<void>;

  validate?(): boolean | Promise<boolean>;

  reload?(sourceNode: TreeNode): void | Promise<void>;

  /**
   * @returns isRedraw
   */
  beforeDraw?(nodes: TreeNode[]): boolean | void | Promise<boolean | void>;

  draw(row: SourceRowBuilder, node: TreeNode): void;
}

export class ColumnRegistrar<
  TreeNode extends BaseTreeNode<TreeNode>,
  S extends ExplorerSource<TreeNode>,
  C extends Column<TreeNode>
> {
  registeredColumnDraws: Record<string, (fileSource: S) => C> = {};

  async getColumns(source: S, columnStrings: string[]) {
    const columns: C[] = [];
    for (const column of columnStrings) {
      const getColumn = this.registeredColumnDraws[column];
      if (getColumn) {
        const column = getColumn(source);
        if (column.inited) {
          columns.push(column);
        } else {
          if (!column.validate || column.validate()) {
            await column.init?.();
            column.inited = true;
            columns.push(column);
          }
        }
      }
    }
    return columns;
  }

  registerColumn(name: string, getFileColumn: C | ((fileSource: S) => C)) {
    if (typeof getFileColumn === 'function') {
      this.registeredColumnDraws[name] = getFileColumn;
    } else {
      this.registeredColumnDraws[name] = () => getFileColumn;
    }
    return Disposable.create(() => {
      delete this.registeredColumnDraws[name];
    });
  }
}
