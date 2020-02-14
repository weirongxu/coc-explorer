import { ColumnRegistrar, ColumnRequired } from './column-registrar';
import { BaseTreeNode, ExplorerSource } from './source';
import { SourceRowBuilder } from './view-builder';
import { hlGroupManager, HighlightPositionWithLine } from './highlight-manager';
import pFilter from 'p-filter';
import { parseTemplate, TemplatePart } from '../parse-template';

export interface DrawLabelingResult {
  highlightPositions: HighlightPositionWithLine[];
  lines: string[];
}

export const labelHighlight = hlGroupManager.linkGroup('Label', 'Label');

export type InitedPartColumn<TreeNode extends BaseTreeNode<TreeNode>> = {
  column: string | ColumnRequired<TreeNode, any>;
  modifiers?: { name: string; column: string | ColumnRequired<TreeNode, any> }[];
};
export type InitedPart<TreeNode extends BaseTreeNode<TreeNode>> =
  | string
  | InitedPartColumn<TreeNode>;

export class TemplateRenderer<TreeNode extends BaseTreeNode<TreeNode>> {
  templateStr: string = '';
  labelingTemplateStr: string = '';
  uniqueColumns: ColumnRequired<TreeNode, any>[] = [];
  initedParts: InitedPart<TreeNode>[] = [];
  initedLabelingParts: InitedPart<TreeNode>[] = [];

  constructor(
    public source: ExplorerSource<TreeNode>,
    public columnRegistrar: ColumnRegistrar<TreeNode, any>,
  ) {}

  private async initPart(part: TemplatePart): Promise<InitedPart<TreeNode>> {
    if (typeof part !== 'string') {
      const column: InitedPartColumn<TreeNode> = {
        column: await this.columnRegistrar.getInitedColumn(this.source, part.column),
      };
      if (part.modifiers) {
        column.modifiers = await Promise.all(
          part.modifiers.map(async (modifier) => ({
            name: modifier.name,
            column: await this.columnRegistrar.getInitedColumn(this.source, modifier.column),
          })),
        );
      }
      return column;
    } else {
      return part;
    }
  }

  async parse(template: string, labelingTemplate?: string) {
    let updateUniqueColumns = false;
    this.uniqueColumns = [];
    if (this.templateStr !== template) {
      this.templateStr = template;
      this.initedParts = [];

      for (const parsedPart of parseTemplate(template)) {
        this.initedParts.push(await this.initPart(parsedPart));
      }
      updateUniqueColumns = true;
    }
    if (labelingTemplate) {
      if (this.labelingTemplateStr !== labelingTemplate) {
        this.labelingTemplateStr = labelingTemplate;
        this.initedLabelingParts = [];

        for (const parsedPart of parseTemplate(labelingTemplate)) {
          this.initedLabelingParts.push(await this.initPart(parsedPart));
        }
        updateUniqueColumns = true;
      }
    }

    if (updateUniqueColumns) {
      this.uniqueColumns = [];

      for (const item of this.initedParts) {
        if (typeof item !== 'string') {
          if (typeof item.column !== 'string') {
            this.uniqueColumns.push(item.column);
          }
          if (item.modifiers) {
            for (const modifier of item.modifiers) {
              if (typeof modifier.column !== 'string') {
                this.uniqueColumns.push(modifier.column);
              }
            }
          }
        }
      }
    }
  }

  async beforeDraw(nodes: TreeNode[]) {
    let redraw = false;
    for (const column of this.uniqueColumns) {
      if (column.beforeDraw) {
        if (await column.beforeDraw(nodes)) {
          redraw = true;
        }
      }
    }
    return redraw;
  }

  async reload(sourceNode: TreeNode) {
    for (const column of this.uniqueColumns) {
      await (column.reload && column.reload(sourceNode));
    }
  }

  async draw(
    row: SourceRowBuilder,
    node: TreeNode,
    nodeIndex: number,
    {
      isLabeling = false,
    }: {
      isLabeling?: boolean;
    } = {},
  ) {
    for (const item of this.initedParts) {
      await row.addTemplatePart(node, nodeIndex, item, isLabeling);
    }
    return row;
  }

  async drawLabeling(node: TreeNode, nodeIndex: number): Promise<DrawLabelingResult> {
    const highlightPositionWithLines: HighlightPositionWithLine[] = [];
    const lines: string[] = [];
    for (const part of this.initedLabelingParts) {
      if (typeof part === 'string') {
        lines.push(part);
        continue;
      }
      const columns = [
        part.column,
        ...(part.modifiers?.map((m) => (m.name === '&' ? m.column : '')) ?? []),
      ].filter((c): c is ColumnRequired<TreeNode, any> => typeof c !== 'string');
      const visibleColumns = await pFilter(
        columns,
        async (c) => !c.labelVisible || (await c.labelVisible(node, { nodeIndex })),
      );
      if (!visibleColumns.length) {
        continue;
      }
      const isAllLabelOnly = visibleColumns.every((c) => c.labelOnly);
      const contentColumns = visibleColumns.filter(async (c) => !c.labelOnly);
      const row = await this.source.viewBuilder.drawRow(async (row) => {
        row.add(
          contentColumns.map((column) => column.label).join(' & ') + (isAllLabelOnly ? '' : ':'),
          { hl: labelHighlight },
        );
        row.add(' ');
        for (const column of contentColumns) {
          await row.addColumn(node, nodeIndex, column, true);
        }
      });
      const { highlightPositions, content } = await row.draw({ flexible: false });
      lines.push(content);
      highlightPositionWithLines.push(
        ...highlightPositions.map((hl) => ({
          line: lines.length - 1,
          ...hl,
        })),
      );
    }
    return {
      highlightPositions: highlightPositionWithLines,
      lines,
    };
  }
}
