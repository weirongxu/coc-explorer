import { Column, ColumnRegistrar } from './column-registrar';
import { BaseTreeNode, ExplorerSource } from './source';
import { SourceRowBuilder } from './view-builder';
import { hlGroupManager, HighlightPositionWithLine } from './highlight-manager';
import pFilter from 'p-filter';

export interface DrawLabelingResult {
  highlightPositions: HighlightPositionWithLine[];
  lines: string[];
}

export const labelHighlight = hlGroupManager.linkGroup('Label', 'Label');

export class ColumnManager<TreeNode extends BaseTreeNode<TreeNode>> {
  columnNames: (string | string[])[] = [];
  columns: Column<TreeNode>[] = [];
  labelingColumns: Column<TreeNode>[][] = [];

  constructor(public source: ExplorerSource<TreeNode>) {}

  async registerColumns(
    columnNames: (string | string[])[],
    columnRegistrar: ColumnRegistrar<TreeNode, any>,
  ) {
    if (this.columnNames.toString() !== columnNames.toString()) {
      this.columnNames = columnNames;
      [this.columns, this.labelingColumns] = await columnRegistrar.getColumns(
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
      isLabeling = false,
    }: {
      columns?: Column<TreeNode>[];
      isLabeling?: boolean;
    } = {},
  ) {
    for (const column of columns) {
      await row.addColumn(node, nodeIndex, column, isLabeling);
    }
    return row;
  }

  async drawLabeling(node: TreeNode, nodeIndex: number): Promise<DrawLabelingResult> {
    const highlightPositionWithLines: HighlightPositionWithLine[] = [];
    const lines: string[] = [];
    let lineIndex: number = 0;
    for (const columns of this.labelingColumns) {
      const allLabelOnly = columns.every((column) => column.labelOnly);
      const displayedColumns = await pFilter(
        columns,
        async (column) =>
          (!column.labelOnly || (await column.labelOnly(node, { nodeIndex }))) &&
          (!column.labelVisible || (await column.labelVisible(node, { nodeIndex }))),
      );
      if (!displayedColumns.length) {
        continue;
      }
      const contentColumns = displayedColumns.filter((column) => !column.labelOnly);
      const row = await this.source.viewBuilder.drawRow(async (row) => {
        row.add(
          displayedColumns.map((column) => column.label).join(' & ') + (allLabelOnly ? '' : ':'),
          { hl: labelHighlight },
        );
        row.add(' ');
        await this.draw(row, node, nodeIndex, {
          columns: contentColumns,
          isLabeling: true,
        });
      });
      const { highlightPositions, content } = await row.draw({ flexible: false });
      highlightPositionWithLines.push(
        ...highlightPositions.map((hl) => ({
          line: lineIndex,
          ...hl,
        })),
      );
      lineIndex += 1;
      lines.push(content);
    }
    return {
      highlightPositions: highlightPositionWithLines,
      lines,
    };
  }
}
