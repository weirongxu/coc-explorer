import { SourceRowBuilder } from './view-builder';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';
import { HighlightConcealable } from './highlight-manager';
import { startCase } from 'lodash';

export interface Column<TreeNode extends BaseTreeNode<TreeNode>> {
  label?: string;

  labelOnly?: (node: TreeNode, option: { nodeIndex: number }) => boolean | Promise<boolean>;

  inited?: boolean;

  concealable?: HighlightConcealable;

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

export class ColumnRegistrar<
  TreeNode extends BaseTreeNode<TreeNode>,
  S extends ExplorerSource<TreeNode>,
  C extends Column<TreeNode>
> {
  registeredColumns: Record<
    string,
    {
      getColumn: (source: S, data: any) => C;
      getInitialData: () => any;
    }
  > = {};

  async getColumns(source: S, columnStrings: (string | string[])[]) {
    const columns: C[] = [];
    const labelingColumns: C[][] = [];
    let labelingColumn = false;
    const getRegisteredColumn = async (columnString: string) => {
      const registeredColumn = this.registeredColumns[columnString];
      if (registeredColumn) {
        const column = registeredColumn.getColumn(source, registeredColumn.getInitialData());
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

  registerColumn<T>(
    name: string,
    getColumn: (source: S, data: T) => C,
    getInitialData: () => T = () => null as any,
  ) {
    this.registeredColumns[name] = {
      getColumn: getColumn,
      getInitialData,
    };
    return Disposable.create(() => {
      delete this.registeredColumns[name];
    });
  }
}
