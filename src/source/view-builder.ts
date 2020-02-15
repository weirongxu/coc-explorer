import {
  HighlightCommand,
  HighlightConcealableCommand,
  HighlightPosition,
  HighlightConcealablePosition,
  hlGroupManager,
} from './highlight-manager';
import { byteLength, displayWidth, displaySlice } from '../util';
import { BaseTreeNode } from './source';
import { Explorer } from '../explorer';
import { compact, flatten, sum } from 'lodash';
import { InitedPart } from './template-renderer';
import { ColumnRequired } from './column-registrar';

// Flexible types
export type DrawFlexiblePosition = 'left' | 'right' | 'center';

export type DrawFlexible = {
  padding?: DrawFlexiblePosition;
  paddingVolume?: number;
  grow?: DrawFlexiblePosition;
  growVolume?: number;
  omit?: DrawFlexiblePosition;
  omitVolume?: number;
};

// Draw types
type DrawFn = (row: SourceRowBuilder) => void | Promise<void>;

type DrawContent = {
  type: 'content';
  content: string;
  /*
   * calculate width via displayWidth
   */
  unicode?: boolean;
  width?: number;
  group?: string;
};

type DrawConcealMark =
  | {
      type: 'conceal';
      concealStart: HighlightConcealableCommand;
    }
  | {
      type: 'conceal';
      concealEnd: HighlightConcealableCommand;
    };

type DrawGroup = {
  type: 'group';
  contents: (DrawContent | DrawConcealMark)[];
  flexible?: DrawFlexible;
};

type Drawable = DrawContent | DrawGroup | DrawConcealMark;

interface DrawContentWithWidth extends DrawContent {
  width: number;
}

interface DrawGroupWithWidth extends DrawGroup {
  contents: (DrawContentWithWidth | DrawConcealMark)[];
}

type DrawableWithWidth = DrawContentWithWidth | DrawGroupWithWidth | DrawConcealMark;

type DrawableFlatWithWidth = DrawContentWithWidth | DrawConcealMark;

const omitSymbolHighlight = hlGroupManager.linkGroup('OmitSymbol', 'SpecialComment');

function divideVolumnBy(totalWidth: number, volumns: number[], widthLimit?: number[]) {
  let unit = totalWidth / sum(volumns);
  const widthes: number[] = new Array(volumns.length);
  if (widthLimit) {
    for (let i = 0; i < volumns.length; i++) {
      const width = Math.ceil(volumns[i] * unit);
      if (width > widthLimit[i]) {
        widthes[i] = widthLimit[i];
        totalWidth -= widthLimit[i];
        volumns[i] = 0;
      }
    }
    unit = totalWidth / sum(volumns);
  }
  for (let i = 0; i < volumns.length; i++) {
    if (widthes[i] === undefined) {
      const width = Math.ceil(volumns[i] * unit);
      if (width <= totalWidth) {
        totalWidth -= width;
        widthes[i] = width;
      } else {
        widthes[i] = totalWidth;
      }
    }
  }
  return widthes;
}

export class SourceViewBuilder {
  constructor(public explorer: Explorer) {}

  get width() {
    return this.explorer.contentWidth;
  }

  async drawRowForNode(node: BaseTreeNode<any>, draw: DrawFn) {
    const row = await this.drawRow(draw);
    const result = await row.draw();
    node.highlightPositions = result.highlightPositions;
    node.concealHighlightPositions = result.concealHighlightPositions;
    node.drawnLine = result.content;
    return node;
  }

  async drawRow(draw: DrawFn): Promise<SourceRowBuilder> {
    const row = new SourceRowBuilder(this);
    await draw(row);
    return row;
  }
}

export class SourceRowBuilder {
  curPosition: number = 0;
  drawableList: Drawable[] = [];

  constructor(public view: SourceViewBuilder) {}

  private async fetchDisplayWidth(drawableList: Drawable[]): Promise<DrawableWithWidth[]> {
    async function getDrawContentWith(drawable: DrawContent): Promise<DrawContentWithWidth> {
      return {
        ...drawable,
        width: drawable.unicode ? await displayWidth(drawable.content) : drawable.content.length,
      };
    }
    return compact(
      flatten(
        await Promise.all(
          drawableList.map(async (it) => {
            if (it.type === 'content') {
              return await getDrawContentWith(it);
            } else if (it.type === 'group') {
              return {
                ...it,
                contents: await Promise.all(
                  compact(
                    it.contents.map((c) => (c.type === 'content' ? getDrawContentWith(c) : null)),
                  ),
                ),
              };
            } else {
              return it;
            }
          }),
        ),
      ),
    );
  }

  private async handlePadding(drawableList: DrawableWithWidth[]): Promise<DrawableWithWidth[]> {
    return drawableList.map((it) => {
      if (it.type === 'group' && it.flexible?.padding && it.flexible.paddingVolume) {
        const width = sum(it.contents.map((c) => (c.type === 'content' ? c.width : 0)));
        if (it.flexible.paddingVolume > width) {
          const width = it.flexible.paddingVolume;
          if (it.flexible.padding === 'left') {
            return {
              ...it,
              contents: [
                {
                  type: 'content',
                  content: ' '.repeat(width),
                  width,
                },
                ...it.contents,
              ],
            };
          } else if (it.flexible.padding === 'right') {
            return {
              ...it,
              contents: [
                ...it.contents,
                {
                  type: 'content',
                  content: ' '.repeat(width),
                  width,
                },
              ],
            };
          } else if (it.flexible.padding === 'center') {
            const left = Math.ceil(width / 2);
            const right = width - left;
            return {
              ...it,
              contents: [
                {
                  type: 'content',
                  content: ' '.repeat(left),
                  width: left,
                },
                ...it.contents,
                {
                  type: 'content',
                  content: ' '.repeat(right),
                  width: right,
                },
              ],
            };
          } else {
            return it;
          }
        } else {
          return it;
        }
      } else {
        return it;
      }
    });
  }

  private async handleGrow(
    fullwidth: number,
    usedWidth: number,
    drawableList: DrawableWithWidth[],
  ): Promise<DrawableFlatWithWidth[]> {
    const allSpaceWidth = fullwidth - usedWidth;
    const spaceWids = divideVolumnBy(
      allSpaceWidth,
      drawableList.map((c) =>
        c.type === 'group' && c.flexible?.grow ? c.flexible.growVolume ?? 1 : 0,
      ),
    );
    return compact(
      flatten(
        await Promise.all(
          drawableList.map(
            async (
              item,
              idx,
            ): Promise<DrawableFlatWithWidth | DrawableFlatWithWidth[] | undefined> => {
              if (item.type === 'content') {
                return item;
              } else if (item.type === 'conceal') {
                return item;
              } else if (item.type === 'group') {
                if (!item.flexible?.grow) {
                  return item.contents;
                }

                const spaceWid = spaceWids[idx];
                if (item.flexible.grow === 'left') {
                  return [
                    {
                      type: 'content',
                      content: ' '.repeat(spaceWid),
                      width: spaceWid,
                    },
                    ...item.contents,
                  ];
                } else if (item.flexible.grow === 'right') {
                  return [
                    ...item.contents,
                    {
                      type: 'content',
                      content: ' '.repeat(spaceWid),
                      width: spaceWid,
                    },
                  ];
                } else if (item.flexible.grow === 'center') {
                  const leftSpace = Math.floor(spaceWid / 2);
                  const rightSpace = spaceWid - leftSpace;
                  return [
                    {
                      type: 'content',
                      content: ' '.repeat(leftSpace),
                      width: leftSpace,
                    },
                    ...item.contents,
                    {
                      type: 'content',
                      content: ' '.repeat(rightSpace),
                      width: rightSpace,
                    },
                  ];
                } else {
                  return item.contents;
                }
              }
            },
          ),
        ),
      ),
    );
  }

  private async handleOmit(
    fullwidth: number,
    usedWidth: number,
    drawableList: DrawableWithWidth[],
  ): Promise<DrawableFlatWithWidth[]> {
    const allOmitWidth = usedWidth - fullwidth;
    const omitWids = divideVolumnBy(
      allOmitWidth,
      drawableList.map((c) =>
        c.type === 'group' && c.flexible?.omit ? c.flexible.omitVolume ?? 1 : 0,
      ),
      drawableList.map((c) => {
        if (c.type === 'content') {
          return c.width;
        } else if (c.type === 'group') {
          return sum(c.contents.map((cc) => (cc.type === 'content' ? cc.width : 0)));
        } else {
          return 0;
        }
      }),
    );
    return compact(
      flatten(
        await Promise.all(
          drawableList.map(
            async (
              item,
              idx,
            ): Promise<DrawableFlatWithWidth | DrawableFlatWithWidth[] | undefined> => {
              if (item.type === 'content') {
                return item;
              } else if (item.type === 'conceal') {
                return item;
              } else if (item.type === 'group') {
                if (!item.flexible?.omit) {
                  return item.contents;
                }

                const omitWid = omitWids[idx];
                const contents: (DrawContentWithWidth | DrawConcealMark)[] = [];

                if (item.flexible.omit === 'left') {
                  const cutWid = omitWid + 1;
                  let remainCutWid = cutWid;
                  for (const c of item.contents) {
                    if (c.type !== 'content') {
                      contents.push(c);
                      continue;
                    }

                    if (remainCutWid < 0) {
                      contents.push(c);
                    } else if (remainCutWid < c.width) {
                      contents.push({
                        type: 'content',
                        content: '‥',
                        width: 1,
                        group: omitSymbolHighlight.group,
                      });
                      if (remainCutWid > 0) {
                        contents.push({
                          ...c,
                          content: await displaySlice(c.content, remainCutWid),
                          width: c.width - remainCutWid,
                        });
                      }
                    }
                    remainCutWid -= c.width;
                  }
                  return contents;
                } else if (item.flexible.omit === 'right') {
                  const cutWid = omitWid + 1;
                  const contentWid = sum(
                    item.contents.map((c) => (c.type === 'content' ? c.width : 0)),
                  );
                  let remainWid = contentWid - cutWid;
                  for (const c of item.contents) {
                    if (c.type !== 'content') {
                      contents.push(c);
                      continue;
                    }

                    if (remainWid >= c.width) {
                      contents.push(c);
                    } else if (remainWid < c.width) {
                      if (remainWid > 0) {
                        contents.push({
                          ...c,
                          content: await displaySlice(c.content, 0, remainWid),
                          width: remainWid,
                        });
                      }
                      contents.push({
                        type: 'content',
                        content: '‥',
                        width: 1,
                        group: omitSymbolHighlight.group,
                      });
                      break;
                    }
                    remainWid -= c.width;
                  }
                  return contents;
                } else if (item.flexible.omit === 'center') {
                  const contentWid = sum(
                    item.contents.map((c) => (c.type === 'content' ? c.width : 0)),
                  );
                  const cutWid = omitWid + 1;
                  const remainWid = contentWid - cutWid;
                  const leftCutPos = Math.floor(remainWid / 2);
                  const rightCutPos = contentWid - (remainWid - leftCutPos);
                  let itemStartPos = 0;
                  let itemEndPos = 0;
                  const contents: (DrawContentWithWidth | DrawConcealMark)[] = [];
                  for (const c of item.contents) {
                    if (c.type !== 'content') {
                      contents.push(c);
                      continue;
                    }
                    itemEndPos += c.width;
                    if (itemStartPos < leftCutPos) {
                      if (itemEndPos <= leftCutPos) {
                        contents.push(c);
                      } else if (itemEndPos <= rightCutPos) {
                        const width = leftCutPos - itemStartPos;
                        contents.push({
                          ...c,
                          content: await displaySlice(c.content, 0, width),
                          width,
                        });
                        contents.push({
                          type: 'content',
                          content: '‥',
                          width: 1,
                          group: omitSymbolHighlight.group,
                        });
                      } else {
                        const leftWidth = leftCutPos - itemStartPos;
                        contents.push({
                          ...c,
                          content: await displaySlice(c.content, 0, leftWidth),
                          width: leftWidth,
                        });
                        contents.push({
                          type: 'content',
                          content: '‥',
                          width: 1,
                          group: omitSymbolHighlight.group,
                        });
                        const rightWidth = itemEndPos - rightCutPos;
                        contents.push({
                          ...c,
                          content: await displaySlice(c.content, c.width - rightWidth),
                          width: rightWidth,
                        });
                      }
                    } else if (itemEndPos > rightCutPos) {
                      if (itemStartPos >= rightCutPos) {
                        contents.push(c);
                      } else {
                        const width = itemEndPos - rightCutPos;
                        contents.push({
                          ...c,
                          content: await displaySlice(c.content, c.width - width),
                          width,
                        });
                      }
                    }
                    itemStartPos = itemEndPos;
                  }
                  return contents;
                }
              }
            },
          ),
        ),
      ),
    );
  }

  async draw({ flexible = true } = {}) {
    // Get drawContent display width
    const drawableList = await this.handlePadding(await this.fetchDisplayWidth(this.drawableList));

    // Draw flexible
    let drawContents: DrawableFlatWithWidth[] = [];
    const fullwidth = this.view.width;
    const usedWidth = sum(
      drawableList.map((c) => {
        if (c.type === 'content') {
          return c.width;
        } else if (c.type === 'group') {
          return sum(c.contents.map((cc) => (cc.type === 'content' ? cc.width : 0)));
        } else {
          return 0;
        }
      }),
    );
    if (!flexible || usedWidth === fullwidth) {
      drawContents = flatten(
        drawableList.map((item): DrawableFlatWithWidth | DrawableFlatWithWidth[] => {
          if (item.type === 'group') {
            return item.contents;
          } else {
            return item;
          }
        }),
      );
    } else if (usedWidth < fullwidth) {
      drawContents = await this.handleGrow(fullwidth, usedWidth, drawableList);
    } else if (usedWidth > fullwidth) {
      drawContents = await this.handleOmit(fullwidth, usedWidth, drawableList);
    }

    // Get content and highlight positions
    const highlightPositions: HighlightPosition[] = [];
    const concealHighlightPositions: HighlightConcealablePosition[] = [];
    let content = '';
    let col = 0;
    let curConceal:
      | {
          start: number;
          concealable: HighlightConcealableCommand;
        }
      | undefined;
    for (const drawContent of drawContents) {
      if (drawContent.type === 'conceal') {
        if ('concealStart' in drawContent) {
          curConceal = {
            concealable: drawContent.concealStart,
            start: col,
          };
        } else if ('concealEnd' in drawContent) {
          if (curConceal && curConceal.concealable == drawContent.concealEnd) {
            concealHighlightPositions.push({
              concealable: curConceal.concealable,
              start: curConceal.start,
              size: col - curConceal.start,
            });
          }
        }
        continue;
      }
      const size = byteLength(drawContent.content);
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
      concealHighlightPositions,
    };
  }

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

  private async drawTo(drawFn: () => any | Promise<any>) {
    const storeList = this.drawableList;
    this.drawableList = [];
    await drawFn();
    const drawableList = this.drawableList;
    this.drawableList = storeList;
    return drawableList;
  }

  async flexible(flexible: DrawFlexible | undefined, drawFn: () => any | Promise<any>) {
    const list = await this.drawTo(drawFn);
    this.drawableList.push(this.flexibleFor(flexible, list));
  }

  flexibleFor(flexible: DrawFlexible | undefined, drawableList: Drawable[]) {
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

  async addColumn<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    column: number | ColumnRequired<TreeNode, any>,
    isLabeling = false,
  ) {
    if (typeof column === 'number') {
      this.add(' '.repeat(column));
      return;
    }

    if (column.concealable) {
      this.drawableList.push({
        type: 'conceal',
        concealStart: column.concealable,
      });
    }
    this.drawableList.push(
      ...(await this.drawTo(async () => {
        await column.draw(this, node, {
          nodeIndex,
          isLabeling,
        });
      })),
    );
    if (column.concealable) {
      this.drawableList.push({
        type: 'conceal',
        concealEnd: column.concealable,
      });
    }
  }

  async addColumnTo<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    column: number | ColumnRequired<TreeNode, any>,
    isLabeling = false,
  ) {
    return await this.drawTo(async () => {
      await this.addColumn(node, nodeIndex, column, isLabeling);
    });
  }

  async addTemplatePart<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    part: InitedPart<TreeNode>,
    isLabeling = false,
  ) {
    if (typeof part === 'string') {
      this.add(part);
      return;
    }

    const drawableList: Drawable[] = [];
    const column = part.column;
    drawableList.push(...(await this.addColumnTo(node, nodeIndex, column, isLabeling)));

    const flexible: DrawFlexible = {};

    const isEmpty = () =>
      sum(
        drawableList.map((p) =>
          p.type === 'content'
            ? p.content.length
            : p.type === 'group'
            ? sum(p.contents.map((c) => (c.type === 'content' ? c.content.length : 0)))
            : 0,
        ),
      ) === 0;

    const getVolumn = (c: number | ColumnRequired<TreeNode, any>) =>
      typeof c === 'number' ? c : 1;

    if (part.modifiers) {
      for (const modifier of part.modifiers) {
        if (modifier.name === '|') {
          if (isEmpty()) {
            drawableList.push(
              ...(await this.addColumnTo(node, nodeIndex, modifier.column, isLabeling)),
            );
          }
        } else if (modifier.name === '&') {
          if (!isEmpty()) {
            drawableList.push(
              ...(await this.addColumnTo(node, nodeIndex, modifier.column, isLabeling)),
            );
          }
        } else if (modifier.name === 'growLeft') {
          flexible.grow = 'left';
          flexible.growVolume = getVolumn(modifier.column);
        } else if (modifier.name === 'growCenter') {
          flexible.grow = 'center';
          flexible.growVolume = getVolumn(modifier.column);
        } else if (modifier.name === 'growRight') {
          flexible.grow = 'right';
          flexible.growVolume = getVolumn(modifier.column);
        } else if (modifier.name === 'omitLeft') {
          flexible.omit = 'left';
          flexible.omitVolume = getVolumn(modifier.column);
        } else if (modifier.name === 'omitCenter') {
          flexible.omit = 'center';
          flexible.omitVolume = getVolumn(modifier.column);
        } else if (modifier.name === 'omitRight') {
          flexible.omit = 'right';
          flexible.omitVolume = getVolumn(modifier.column);
        }
      }
    }
    if (flexible.omit || flexible.grow) {
      this.drawableList.push(this.flexibleFor(flexible, drawableList));
    } else {
      this.drawableList.push(...drawableList);
    }
  }
}
