import { ViewRowPainter } from './viewPainter';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';

export type ColumnDrawHandle<TreeNode extends BaseTreeNode<TreeNode>> = {
  labelOnly?: boolean;
  labelVisible?: (option: {
    node: TreeNode;
    nodeIndex: number;
  }) => boolean | Promise<boolean>;
  drawNode: (
    row: ViewRowPainter,
    option: { node: TreeNode; nodeIndex: number; isLabeling: boolean },
  ) => void | Promise<void>;
};

export interface ColumnInitial<TreeNode extends BaseTreeNode<TreeNode>> {
  label?: string;

  inited?: boolean;

  init?(): void | Promise<void>;

  available?(): boolean | Promise<boolean>;

  load?(parentNode: TreeNode): void | Promise<void>;

  draw(
    nodes: TreeNode[],
    options: {
      force: boolean;
      drawAll: () => never | void;
      abort: () => never;
    },
  ): ColumnDrawHandle<TreeNode> | Promise<ColumnDrawHandle<TreeNode>>;
}

export interface Column<TreeNode extends BaseTreeNode<TreeNode>>
  extends ColumnInitial<TreeNode> {
  label: string;
  subscriptions: Disposable[];
  drawHandle?: ColumnDrawHandle<TreeNode>;
}

type CreateColumn<
  S extends ExplorerSource<TreeNode>,
  TreeNode extends BaseTreeNode<TreeNode>
> = (context: {
  source: S;
  column: Column<TreeNode>;
  subscriptions: Disposable[];
}) => ColumnInitial<TreeNode>;

export class ColumnRegistrar<
  TreeNode extends BaseTreeNode<TreeNode, Type>,
  S extends ExplorerSource<TreeNode>,
  Type extends string = TreeNode['type']
> {
  registeredColumns: Map<
    Type,
    Map<
      string,
      {
        createColumn: CreateColumn<S, TreeNode>;
      }
    >
  > = new Map();

  /**
   * Get ColumnRequired by column name
   */
  async initColumn(
    type: Type,
    source: S,
    columnName: string,
  ): Promise<undefined | number | Column<TreeNode>> {
    if (/\d+/.test(columnName)) {
      return parseInt(columnName, 10);
    }

    const registeredColumn = this.registeredColumns.get(type)?.get(columnName);
    if (!registeredColumn) {
      throw Error(`column(${columnName}) not found`);
    }

    const column = { label: columnName } as Column<TreeNode>;
    const subscriptions: Disposable[] = [];
    Object.assign(
      column,
      registeredColumn.createColumn({
        source,
        column,
        subscriptions,
      }),
      { subscriptions },
    );

    if (column.inited) {
      return column;
    }

    if (column.available && !(await column.available())) {
      return undefined;
    }

    await column.init?.();
    column.inited = true;
    return column;
  }

  registerColumn(
    type: Type,
    name: string,
    createColumn: CreateColumn<S, TreeNode>,
  ) {
    if (!this.registeredColumns.has(type)) {
      this.registeredColumns.set(type, new Map());
    }
    this.registeredColumns.get(type)!.set(name, {
      createColumn,
    });
    return Disposable.create(() => {
      this.registeredColumns.get(type)!.delete(name);
    });
  }
}
