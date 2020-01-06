import { Column, ColumnRegistrar } from './column-registrar';
import { BaseTreeNode, ExplorerSource } from './source';
import { SourceRowBuilder, HighlightPosition } from './view-builder';
import { hlGroupManager } from './highlight-manager';

export interface DrawMultiLineResult {
  highlightPositions: HighlightPosition[];
  lines: string[];
}

export const labelHighlight = hlGroupManager.linkGroup('Label', 'Label');

export class ColumnManager<TreeNode extends BaseTreeNode<TreeNode>> {
  columnNames: (string | string[])[] = [];
  columns: Column<TreeNode>[] = [];
  multiLineColumns: Column<TreeNode>[][] = [];

  constructor(public source: ExplorerSource<TreeNode>) {}

  async registerColumns(
    columnNames: (string | string[])[],
    columnRegistrar: ColumnRegistrar<TreeNode, any, any>,
  ) {
    if (this.columnNames.toString() !== columnNames.toString()) {
      this.columnNames = columnNames;
      [this.columns, this.multiLineColumns] = await columnRegistrar.getColumns(
        this.source,
        columnNames,
      );
    }
  }

  /**
   * @returns return true to redraw all rows
   */
  async beforeDraw(nodes: TreeNode[]) {
    let redraw = false;
    for (const column of this.columns) {
      if (column.beforeDraw) {
        if (await column.beforeDraw(nodes)) {
          redraw = true;
        }
      }
    }
    return redraw;
  }

  async reload(sourceNode: TreeNode) {
    for (const column of this.columns) {
      await (column.reload && column.reload(sourceNode));
    }
  }

  async draw(
    row: SourceRowBuilder,
    node: TreeNode,
    nodeIndex: number,
    {
      columns = this.columns,
      isMultiLine = false,
    }: {
      columns?: Column<TreeNode>[];
      isMultiLine?: boolean;
    } = {},
  ) {
    for (const column of columns) {
      if (column.concealable) {
        row.concealableColumn(column.concealable, async () => {
          await column.draw(row, node, { nodeIndex, isMultiLine });
        });
      } else {
        await column.draw(row, node, { nodeIndex, isMultiLine });
      }
    }
    return row;
  }

  async drawMultiLine(node: TreeNode, nodeIndex: number): Promise<DrawMultiLineResult> {
    const highlightPositions: HighlightPosition[] = [];
    const lines: string[] = [];
    let lineIndex = 0;
    for (const columns of this.multiLineColumns) {
      const row = await this.source.viewBuilder.drawRow(
        async (row) => {
          row.add(columns.map((column) => column.label).join(' & ') + ': ', labelHighlight);
          await this.draw(row, node, nodeIndex, {
            columns,
            isMultiLine: true,
          });
        },
        {
          highlightMode: 'highlight',
          relativeLineIndex: lineIndex,
        },
      );
      highlightPositions.push(...row.highlightPositions);
      lineIndex += 1;
      lines.push(row.content);
    }
    return {
      highlightPositions,
      lines,
    };
  }
}
