import { Explorer } from '../explorer';
import { HighlightCommand, HighlightPosition } from '../highlight/types';
import {
  Drawable,
  DrawBlock,
  DrawContent,
  DrawContentWithWidth,
  DrawFlexible,
  DrawGroup,
  Drawn,
} from '../painter/types';
import {
  fetchDisplayWidth,
  handleGrow,
  handleOmit,
  handlePadding,
  isEmptyDrawableList,
} from '../painter/util';
import { flatten, sum } from '../util';
import { Column } from './columnRegistrar';
import { BaseTreeNode } from './source';
import { TemplatePart } from './sourcePainters';

export class ViewPainter {
  constructor(public explorer: Explorer) {}

  get width() {
    return this.explorer.contentWidth;
  }

  async drawRow(draw: DrawBlock): Promise<ViewRowPainter> {
    const row = new ViewRowPainter(this);
    await draw(row);
    return row;
  }
}

export class ViewRowPainter {
  drawableList: Drawable[] = [];

  constructor(public view: ViewPainter) {}

  /**
   * Draw the `ViewRowPainter` to `Drawn`
   */
  async draw({ flexible = true } = {}): Promise<Drawn> {
    // Get drawContent display width
    const drawableList = await handlePadding(
      await fetchDisplayWidth(this.drawableList),
    );

    // Draw flexible
    let drawContents: DrawContentWithWidth[] = [];
    const fullwidth = this.view.width;
    const usedWidth = sum(
      drawableList.map((c) => {
        if (c.type === 'content') {
          return c.width;
        } else if (c.type === 'group') {
          return sum(
            c.contents.map((cc) => (cc.type === 'content' ? cc.width : 0)),
          );
        } else {
          return 0;
        }
      }),
    );
    if (!flexible || usedWidth === fullwidth) {
      drawContents = flatten(
        drawableList.map((item):
          | DrawContentWithWidth
          | DrawContentWithWidth[] => {
          if (item.type === 'group') {
            return item.contents;
          } else {
            return item;
          }
        }),
      );
    } else if (usedWidth < fullwidth) {
      drawContents = await handleGrow(fullwidth, usedWidth, drawableList);
    } else if (usedWidth > fullwidth) {
      drawContents = await handleOmit(fullwidth, usedWidth, drawableList);
    }

    // Get content and highlight positions
    const highlightPositions: HighlightPosition[] = [];
    let content = '';
    let col = 0;
    for (const drawContent of drawContents) {
      const size = drawContent.content.length;
      if (drawContent.group) {
        highlightPositions.push({
          group: drawContent.group,
          start: col,
          size,
        });
      }
      content += drawContent.content;
      col += size;
    }
    return {
      content,
      highlightPositions,
    };
  }

  /**
   * Add a string to `ViewRowPainter`
   */
  add(
    content: string,
    {
      hl,
      width,
      drawGroup,
      unicode = false,
    }: {
      hl?: HighlightCommand;
      width?: number;
      drawGroup?: DrawGroup;
      unicode?: boolean;
    } = {},
  ) {
    const drawContent: DrawContent = {
      type: 'content',
      content,
      unicode,
      group: hl?.group,
      width,
    };
    if (drawGroup) {
      drawGroup.contents.push(drawContent);
    } else {
      this.drawableList.push(drawContent);
    }
  }

  /**
   * Get `Drawable` list from a `DrawBlock`
   */
  private async drawBlockToList(drawBlock: DrawBlock) {
    const storeList = this.drawableList;
    this.drawableList = [];
    await drawBlock(this);
    const drawableList = this.drawableList;
    this.drawableList = storeList;
    return drawableList;
  }

  async flexible(flexible: DrawFlexible | undefined, drawBlock: DrawBlock) {
    const list = await this.drawBlockToList(drawBlock);
    this.drawableList.push(this.flexibleForList(flexible, list));
  }

  /**
   * Apply the flexible to the `Drawable` list
   */
  private flexibleForList(
    flexible: DrawFlexible | undefined,
    drawableList: Drawable[],
  ) {
    return {
      type: 'group',
      contents: flatten(
        drawableList.map((c) => {
          if (c.type === 'content') {
            return c;
          } else if (c.type === 'group') {
            return c.contents;
          } else {
            return c;
          }
        }),
      ),
      flexible,
    } as DrawGroup;
  }

  /**
   * Add a `Column` to `ViewRowPainter`
   */
  async addColumn<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    column: number | Column<TreeNode>,
    isLabeling = false,
  ) {
    this.drawableList.push(
      ...(await this.columnToList(node, nodeIndex, column, isLabeling)),
    );
  }

  /**
   * Get `Drawable` list from a `Column` and node
   */
  private async columnToList<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    column: number | Column<TreeNode>,
    isLabeling = false,
  ) {
    return await this.drawBlockToList(async () => {
      if (typeof column === 'number') {
        this.add(' '.repeat(column));
        return;
      }

      await column.drawHandle?.drawNode(this, {
        node,
        nodeIndex,
        isLabeling,
      });
    });
  }

  /**
   * Add a `TemplatePart` to `ViewRowPainter`
   */
  async addTemplatePart<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    part: TemplatePart<TreeNode>,
    isLabeling = false,
  ) {
    if (typeof part === 'string') {
      this.add(part);
      return;
    }

    const drawableList: Drawable[] = [];
    const column = part.column;
    drawableList.push(
      ...(await this.columnToList(node, nodeIndex, column, isLabeling)),
    );

    const flexible: DrawFlexible = {};

    const getVolume = (c: number | Column<TreeNode>) =>
      typeof c === 'number' ? c : 1;

    if (part.modifiers) {
      for (const modifier of part.modifiers) {
        if (modifier.name === '|') {
          if (isEmptyDrawableList(drawableList)) {
            drawableList.push(
              ...(await this.columnToList(
                node,
                nodeIndex,
                modifier.column,
                isLabeling,
              )),
            );
          }
        } else if (modifier.name === '&') {
          if (!isEmptyDrawableList(drawableList)) {
            drawableList.push(
              ...(await this.columnToList(
                node,
                nodeIndex,
                modifier.column,
                isLabeling,
              )),
            );
          }
        } else if (modifier.name === 'growLeft') {
          flexible.grow = 'left';
          flexible.growVolume = getVolume(modifier.column);
        } else if (modifier.name === 'growCenter') {
          flexible.grow = 'center';
          flexible.growVolume = getVolume(modifier.column);
        } else if (modifier.name === 'growRight') {
          flexible.grow = 'right';
          flexible.growVolume = getVolume(modifier.column);
        } else if (modifier.name === 'omitLeft') {
          flexible.omit = 'left';
          flexible.omitVolume = getVolume(modifier.column);
        } else if (modifier.name === 'omitCenter') {
          flexible.omit = 'center';
          flexible.omitVolume = getVolume(modifier.column);
        } else if (modifier.name === 'omitRight') {
          flexible.omit = 'right';
          flexible.omitVolume = getVolume(modifier.column);
        }
      }
    }
    if (flexible.omit || flexible.grow) {
      this.drawableList.push(this.flexibleForList(flexible, drawableList));
    } else {
      this.drawableList.push(...drawableList);
    }
  }
}
