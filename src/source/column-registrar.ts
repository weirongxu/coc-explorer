import { SourceRowBuilder } from './view-builder';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';

export interface Column<TreeNode extends BaseTreeNode<TreeNode>, Data = any> {
  label?: string;

  labelOnly?: boolean;

  labelVisible?: (node: TreeNode, option: { nodeIndex: number }) => boolean | Promise<boolean>;

  inited?: boolean;

  readonly data?: Data;

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
  label: string;
  data: Data;
}

type GetColumn<
  S extends ExplorerSource<TreeNode>,
  TreeNode extends BaseTreeNode<TreeNode>,
  Data
> = (context: { source: S; column: ColumnRequired<TreeNode, Data> }) => Column<TreeNode, Data>;

export class ColumnRegistrar<
  TreeNode extends BaseTreeNode<TreeNode, Type>,
  S extends ExplorerSource<TreeNode>,
  Type extends string = TreeNode['type']
> {
  registeredColumns: Record<
    string,
    Record<
      string,
      {
        getColumn: GetColumn<S, TreeNode, any>;
      }
    >
  > = {};

  async getInitedColumn(
    type: string,
    source: S,
    columnName: string,
  ): Promise<number | ColumnRequired<TreeNode, any>> {
    if (/\d+/.test(columnName)) {
      return parseInt(columnName, 10);
    } else {
      const registeredColumn = this.registeredColumns[type]?.[columnName];
      if (registeredColumn) {
        const column = { label: columnName } as ColumnRequired<TreeNode, any>;
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
      throw Error(`column(${columnName}) not found`);
    }
  }

  registerColumn<Data>(type: Type, name: string, getColumn: GetColumn<S, TreeNode, Data>) {
    if (!(type in this.registeredColumns)) {
      this.registeredColumns[type] = {};
    }
    this.registeredColumns[type][name] = {
      getColumn,
    };
    return Disposable.create(() => {
      delete this.registeredColumns[type][name];
    });
  }
}
