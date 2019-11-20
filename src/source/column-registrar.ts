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
   * @returns return true to redraw all rows
   */
  beforeDraw?(nodes: TreeNode[]): boolean | void | Promise<boolean | void>;

  draw(row: SourceRowBuilder, node: TreeNode, nodeIndex: number): void;
}

export class ColumnRegistrar<
  TreeNode extends BaseTreeNode<TreeNode>,
  S extends ExplorerSource<TreeNode>,
  C extends Column<TreeNode>
> {
  registeredColumns: Record<
    string,
    {
      getFileColumn: (fileSource: S, data: any) => C;
      getInitialData: () => any;
    }
  > = {};

  async getColumns(source: S, columnStrings: string[]) {
    const columns: C[] = [];
    for (const column of columnStrings) {
      const getColumn = this.registeredColumns[column];
      if (getColumn) {
        const column = getColumn.getFileColumn(source, getColumn.getInitialData());
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

  registerColumn<T>(
    name: string,
    getFileColumn: (fileSource: S, data: T) => C,
    getInitialData: () => T = () => null as any,
  ) {
    this.registeredColumns[name] = {
      getFileColumn,
      getInitialData,
    };
    return Disposable.create(() => {
      delete this.registeredColumns[name];
    });
  }
}
