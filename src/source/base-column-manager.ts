import { SourceRowBuilder } from './view-builder';
import { ExplorerSource, BaseTreeNode } from './source';
import { Disposable } from 'coc.nvim';

export interface ColumnDraw<TreeNode extends BaseTreeNode<TreeNode>> {
  init?(): void;

  validate?(): boolean | Promise<boolean>;

  load?(sourceNode: TreeNode): void | Promise<void>;

  /**
   * @returns isRedraw
   */
  beforeDraw?(nodes: TreeNode[]): boolean | void | Promise<boolean | void>;

  draw(row: SourceRowBuilder, node: TreeNode): void;
}

export class BaseColumnManager<
  TreeNode extends BaseTreeNode<TreeNode>,
  S extends ExplorerSource<TreeNode>,
  C extends ColumnDraw<TreeNode>
> {
  registeredColumns: Record<string, (fileSource: S) => C> = {};
  columnDraws: C[] = [];

  constructor(public columns: string[]) {}

  async init(source: S) {
    this.columnDraws = [];
    for (const c of this.columns) {
      const getColumn = this.registeredColumns[c];
      if (getColumn) {
        const column = getColumn(source);
        if (!column.validate || column.validate()) {
          this.columnDraws.push(column);
        }
      }
    }
    this.columnDraws.forEach((c) => {
      c.init && c.init();
    });
  }

  registerColumn(name: string, getFileColumn: C | ((fileSource: S) => C)) {
    if (typeof getFileColumn === 'function') {
      this.registeredColumns[name] = getFileColumn;
    } else {
      this.registeredColumns[name] = () => getFileColumn;
    }
    return Disposable.create(() => {
      delete this.registeredColumns[name];
    });
  }

  async load(sourceNode: TreeNode) {
    for (const fileColumn of this.columnDraws) {
      await (fileColumn.load && fileColumn.load(sourceNode));
    }
  }

  /**
   * @returns return true to redraw all rows
   */
  async beforeDraw(nodes: TreeNode[]): Promise<boolean> {
    let redraw = false;
    for (const fileColumn of this.columnDraws) {
      if (fileColumn.beforeDraw) {
        if (await fileColumn.beforeDraw(nodes)) {
          redraw = true;
        }
      }
    }
    return redraw;
  }

  drawNode(row: SourceRowBuilder, node: TreeNode) {
    this.columnDraws.forEach((column) => {
      column.draw(row, node);
    });
  }
}
