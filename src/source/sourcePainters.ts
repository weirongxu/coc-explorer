import pFilter from 'p-filter';
import { compactI, groupBy } from '../util';
import { Column, ColumnRegistrar } from './columnRegistrar';
import { hlGroupManager } from '../highlight/manager';
import { OriginalTemplatePart, parseTemplate } from './parseTemplate';
import { BaseTreeNode, ExplorerSource } from './source';
import { ViewPainter } from './viewPainter';
import { Disposable } from 'coc.nvim';
import { Drawn, DrawnWithNodeIndex } from '../painter/types';

export const labelHighlight = hlGroupManager.linkGroup('Label', 'Label');

export type TemplateBlock<TreeNode extends BaseTreeNode<TreeNode>> = {
  column: number | Column<TreeNode>;
  modifiers?: {
    name: string;
    column: number | Column<TreeNode>;
  }[];
};

export type TemplatePart<TreeNode extends BaseTreeNode<TreeNode>> =
  | string
  | TemplateBlock<TreeNode>;

export class SourcePainter<
  TreeNode extends BaseTreeNode<TreeNode, Type>,
  Type extends string = TreeNode['type'],
> implements Disposable
{
  templateStr?: string;
  labelingTemplateStr?: string;
  columns = new Set<Column<TreeNode>>();
  parts: TemplatePart<TreeNode>[] = [];
  labelingParts: TemplatePart<TreeNode>[] = [];

  constructor(
    public readonly type: Type,
    public painters: SourcePainters<TreeNode>,
    public source: ExplorerSource<TreeNode>,
    public columnRegistrar: ColumnRegistrar<TreeNode, any>,
  ) {}

  dispose() {
    this.clearParts(this.parts);
  }

  private clearColumn(column: number | Column<TreeNode>) {
    if (typeof column !== 'number') {
      column.subscriptions.map((s) => s.dispose());
    }
  }

  private clearParts(parts: TemplatePart<TreeNode>[]) {
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        this.clearColumn(part.column);
        part.modifiers?.forEach((m) => this.clearColumn(m.column));
      }
    });
  }

  async parseTemplate(template: string, labelingTemplate?: string) {
    let needUpdateColumns = false;
    if (this.templateStr !== template) {
      this.templateStr = template;
      const initedParts: TemplatePart<TreeNode>[] = [];

      for (const parsedPart of parseTemplate(template)) {
        const part = await this.initPart(parsedPart);
        if (part) {
          initedParts.push(part);
        }
      }

      this.clearParts(this.parts);
      this.parts = initedParts;
      needUpdateColumns = true;
    }
    if (labelingTemplate) {
      if (this.labelingTemplateStr !== labelingTemplate) {
        this.labelingTemplateStr = labelingTemplate;
        const initedLabelingParts: TemplatePart<TreeNode>[] = [];

        for (const parsedPart of parseTemplate(labelingTemplate)) {
          const part = await this.initPart(parsedPart);
          if (part) {
            initedLabelingParts.push(part);
          }
        }

        this.clearParts(this.labelingParts);
        this.labelingParts = initedLabelingParts;
        needUpdateColumns = true;
      }
    }

    if (needUpdateColumns) {
      const columnSet = new Set<Column<TreeNode>>();

      const initedParts = [...this.parts, ...this.labelingParts];
      for (const item of initedParts) {
        if (typeof item !== 'string') {
          if (typeof item.column !== 'number') {
            columnSet.add(item.column);
          }
          if (item.modifiers) {
            for (const modifier of item.modifiers) {
              if (typeof modifier.column !== 'number') {
                columnSet.add(modifier.column);
              }
            }
          }
        }
      }

      this.columns = columnSet;
    }
  }

  async initPart(
    part: OriginalTemplatePart,
  ): Promise<undefined | TemplatePart<TreeNode>> {
    if (typeof part === 'string') {
      return part;
    }

    const column = await this.columnRegistrar.initColumn(
      this.type,
      this.source,
      part.column,
    );

    if (!column) {
      return undefined;
    }

    const block: TemplateBlock<TreeNode> = {
      column,
    };

    if (part.modifiers) {
      const modifiers = await Promise.all(
        part.modifiers.map(async (modifier) => {
          const column = await this.columnRegistrar.initColumn(
            this.type,
            this.source,
            modifier.column,
          );
          if (!column) {
            return undefined;
          }
          return {
            name: modifier.name,
            column,
          };
        }),
      );
      block.modifiers = compactI(modifiers);
    }
    return block;
  }
}

export class SourcePainters<
  TreeNode extends BaseTreeNode<TreeNode, Type>,
  Type extends string = TreeNode['type'],
> implements Disposable
{
  painters = new Map<Type, SourcePainter<TreeNode, Type>>();
  readonly viewPainter = new ViewPainter(this.source.explorer);

  constructor(
    public source: ExplorerSource<TreeNode>,
    public columnRegistrar: ColumnRegistrar<TreeNode, any>,
  ) {}

  dispose() {
    this.painters.forEach((painter) => painter.dispose());
  }

  getPainter(type: Type) {
    if (!this.painters.has(type)) {
      this.painters.set(
        type,
        new SourcePainter(type, this, this.source, this.columnRegistrar),
      );
    }
    return this.painters.get(type)!;
  }

  async parseTemplate(type: Type, template: string, labelingTemplate?: string) {
    return await this.getPainter(type).parseTemplate(
      template,
      labelingTemplate,
    );
  }

  async load(parentNode: TreeNode) {
    for (const painter of this.painters.values()) {
      for (const column of painter.columns) {
        await (column.load && column.load(parentNode));
      }
    }
  }

  async drawPre<T = undefined, R = undefined, A = undefined>(
    nodes: TreeNode[],
    {
      draw,
      drawAll,
      abort,
      force = false,
    }: {
      draw?: () => T | Promise<T>;
      drawAll?: () => R | Promise<R>;
      abort?: () => A | Promise<A>;
      force?: boolean;
    } = {},
  ): Promise<T | R | A> {
    class DrawAll extends Error {}
    class Abort extends Error {}
    const nodesGroup = groupBy(nodes, (n) => n.type);
    const types = Object.keys(nodesGroup) as Type[];
    for (const type of types) {
      const painter = this.getPainter(type);
      for (const column of painter.columns) {
        try {
          column.drawHandle = await column.draw(nodesGroup[type], {
            drawAll() {
              if (drawAll) {
                throw new DrawAll();
              }
            },
            abort() {
              throw new Abort();
            },
            force,
          });
        } catch (err) {
          if (err instanceof DrawAll) {
            return drawAll!();
          } else if (err instanceof Abort) {
            if (abort) {
              return abort();
            }
          } else {
            throw err;
          }
        }
      }
    }
    return draw?.() as T;
  }

  async drawNode(
    node: TreeNode,
    nodeIndex: number,
    {
      isLabeling = false,
    }: {
      isLabeling?: boolean;
    } = {},
  ): Promise<DrawnWithNodeIndex> {
    const row = await this.viewPainter.drawRow(async (row) => {
      for (const part of this.getPainter(node.type).parts) {
        await row.addTemplatePart(node, nodeIndex, part, isLabeling);
      }
    });
    const drawn = await row.draw();
    return {
      nodeIndex,
      nodeUid: node.uid,
      content: drawn.content,
      highlightPositions: drawn.highlightPositions,
    };
  }

  async drawNodeLabeling(node: TreeNode, nodeIndex: number): Promise<Drawn[]> {
    const drawnList: Drawn[] = [];
    for (const part of this.getPainter(node.type).labelingParts) {
      if (typeof part === 'string') {
        drawnList.push({
          content: part,
          highlightPositions: [],
        });
        continue;
      }
      const columns = [
        part.column,
        ...(part.modifiers?.map((m) => (m.name === '&' ? m.column : '')) ?? []),
      ].filter((c): c is Column<TreeNode> => typeof c !== 'string');
      const visibleColumns = await pFilter(
        columns,
        async (c) =>
          !c.drawHandle?.labelVisible ||
          (await c.drawHandle.labelVisible({ node, nodeIndex })),
      );
      if (!visibleColumns.length) {
        continue;
      }
      const isAllLabelOnly = visibleColumns.every(
        (c) => c.drawHandle?.labelOnly,
      );
      const contentColumns = visibleColumns.filter(
        async (c) => !c.drawHandle?.labelOnly,
      );
      const row = await this.viewPainter.drawRow(async (row) => {
        row.add(
          visibleColumns.map((column) => column.label).join(' & ') +
            (isAllLabelOnly ? '' : ':'),
          { hl: labelHighlight },
        );
        row.add(' ');
        for (const column of contentColumns) {
          await row.addColumn(node, nodeIndex, column, true);
        }
      });
      const { highlightPositions, content } = await row.draw({
        flexible: false,
      });
      drawnList.push({
        content,
        highlightPositions,
      });
    }
    return drawnList;
  }
}
