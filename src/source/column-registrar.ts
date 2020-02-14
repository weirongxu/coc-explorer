import { SourceRowBuilder } from './view-builder';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';
import { HighlightConcealableCommand } from './highlight-manager';

export interface Column<TreeNode extends BaseTreeNode<TreeNode>, Data = any> {
  label?: string;

  labelOnly?: boolean;

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
  label: string;
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

  async getInitedColumn(
    source: S,
    columnName: string,
  ): Promise<string | ColumnRequired<TreeNode, any>> {
    if (/\d+/.test(columnName)) {
      const num = parseInt(columnName, 10);
      return ' '.repeat(num);
    } else {
      const registeredColumn = this.registeredColumns[columnName];
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

  registerColumn<Data>(name: string, getColumn: GetColumn<S, TreeNode, Data>) {
    this.registeredColumns[name] = {
      getColumn,
    };
    return Disposable.create(() => {
      delete this.registeredColumns[name];
    });
  }
}
