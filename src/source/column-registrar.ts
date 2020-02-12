import { SourceRowBuilder } from './view-builder';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';
import { HighlightConcealableCommand } from './highlight-manager';
import { startCase } from 'lodash';

export interface Column<TreeNode extends BaseTreeNode<TreeNode>, Data = any> {
  label?: string;

  labelOnly?: (node: TreeNode, option: { nodeIndex: number }) => boolean | Promise<boolean>;

  labelVisible?: (node: TreeNode, option: { nodeIndex: number }) => boolean | Promise<boolean>;

  inited?: boolean;

  readonly data?: Data;

  readonly concealable?: HighlightConcealableCommand;

  init?(): void | Promise<void>;

  validate?(): boolean | Promise<boolean>;

  reload?(sourceNode: TreeNode): void | Promise<void>;

  /**
   * @returns return true to redraw all rows
   */
  beforeDraw?(nodes: TreeNode[]): boolean | void | Promise<boolean | void>;

  draw(
    row: SourceRowBuilder,
    node: TreeNode,
    option: { nodeIndex: number; isLabeling: boolean },
  ): void | Promise<void>;
}

export interface ColumnRequired<TreeNode extends BaseTreeNode<TreeNode>, Data>
  extends Column<TreeNode, Data> {
  data: Data;
  concealable: HighlightConcealableCommand;
}

type GetColumn<
  S extends ExplorerSource<TreeNode>,
  TreeNode extends BaseTreeNode<TreeNode>,
  Data
> = (context: { source: S; column: ColumnRequired<TreeNode, Data> }) => Column<TreeNode, Data>;

export class ColumnRegistrar<
  TreeNode extends BaseTreeNode<TreeNode>,
  S extends ExplorerSource<TreeNode>
> {
  registeredColumns: Record<
    string,
    {
      getColumn: GetColumn<S, TreeNode, any>;
    }
  > = {};

  async getColumns(source: S, columnStrings: (string | string[])[]) {
    type C = Column<TreeNode>;
    const columns: C[] = [];
    const labelingColumns: C[][] = [];
    let labelingColumn = false;
    const getRegisteredColumn = async (columnString: string) => {
      const registeredColumn = this.registeredColumns[columnString];
      if (registeredColumn) {
        const column = {} as ColumnRequired<TreeNode, any>;
        Object.assign(column, registeredColumn.getColumn({ source, column }));
        if (column.inited) {
          return column;
        } else {
          if (!column.validate || column.validate()) {
            await column.init?.();
            column.inited = true;
            return column;
          }
        }
      }
    };
    for (const columnStrs of columnStrings) {
      if (Array.isArray(columnStrs)) {
        labelingColumn = true;
      }
      if (!labelingColumn) {
        const columnStr = columnStrs as string;
        const column = await getRegisteredColumn(columnStr);
        if (column) {
          columns.push({
            label: startCase(columnStr),
            ...column,
          });
        }
      } else {
        const labelingRow: C[] = [];
        for (const columnStr of columnStrs as string[]) {
          const column = await getRegisteredColumn(columnStr);
          if (column) {
            labelingRow.push({
              label: startCase(columnStr),
              ...column,
            });
          }
        }
        labelingColumns.push(labelingRow);
      }
    }
    return [columns, labelingColumns] as const;
  }

  registerColumn<Data>(name: string, getColumn: GetColumn<S, TreeNode, Data>) {
    this.registeredColumns[name] = {
      getColumn,
    };
    return Disposable.create(() => {
      delete this.registeredColumns[name];
    });
  }
}
