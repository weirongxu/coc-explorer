import {
  HighlightCommand,
  HighlightConcealableCommand,
  HighlightPosition,
  HighlightConcealablePosition,
  hlGroupManager,
} from './highlight-manager';
import { byteLength, displayWidth, displaySlice } from '../util';
import { Column } from './column-registrar';
import { BaseTreeNode } from './source';
import { Explorer } from '../explorer';
import { compact, flatten, sum } from 'lodash';

// Flexible types
export type DrawFlexiblePosition = 'left' | 'right' | 'center';

export type DrawFlexible = {
  align?: DrawFlexiblePosition;
  omit?: DrawFlexiblePosition;
  alignVolume?: number;
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

  async draw({ flexible = true } = {}) {
    // Get drawContent display width
    async function getDrawContentWith(drawable: DrawContent): Promise<DrawContentWithWidth> {
      return {
        ...drawable,
        width: drawable.unicode ? await displayWidth(drawable.content) : drawable.content.length,
      };
    }
    const drawList: DrawableWithWidth[] = compact(
      flatten(
        await Promise.all(
          this.drawableList.map(async (drawable) => {
            if (drawable.type === 'content') {
              return await getDrawContentWith(drawable);
            } else if (drawable.type === 'group') {
              return {
                ...drawable,
                contents: await Promise.all(
                  compact(
                    drawable.contents.map((c) =>
                      c.type === 'content' ? getDrawContentWith(c) : null,
                    ),
                  ),
                ),
              };
            } else {
              return drawable;
            }
          }),
        ),
      ),
    );

    // Draw flexible
    let drawContents: DrawableFlatWithWidth[] = [];
    const fullwidth = this.view.width;
    const usedWidth = sum(
      drawList.map((c) => {
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
        drawList.map((item): DrawableFlatWithWidth | DrawableFlatWithWidth[] => {
          if (item.type === 'group') {
            return item.contents;
          } else {
            return item;
          }
        }),
      );
    } else if (usedWidth < fullwidth) {
      // Align
      const allSpaceWidth = fullwidth - usedWidth;
      const alignVolume = sum(
        drawList.map((c) =>
          c.type === 'group' && c.flexible?.align ? c.flexible.alignVolume ?? 1 : 0,
        ),
      );
      // TODO unit * alignVolume !== allSpaceWidth
      const unitSpaceWid = Math.floor(allSpaceWidth / alignVolume);
      drawContents = compact(
        flatten(
          await Promise.all(
            drawList.map(
              async (
                item,
              ): Promise<DrawableFlatWithWidth | DrawableFlatWithWidth[] | undefined> => {
                if (item.type === 'content') {
                  return item;
                } else if (item.type === 'conceal') {
                  return item;
                } else if (item.type === 'group') {
                  if (!item.flexible?.align) {
                    return item.contents;
                  }

                  const spaceWid = unitSpaceWid * (item.flexible.alignVolume ?? 1);
                  if (item.flexible.align === 'left') {
                    return [
                      {
                        type: 'content',
                        content: ' '.repeat(spaceWid),
                        width: spaceWid,
                      },
                      ...item.contents,
                    ];
                  } else if (item.flexible.align === 'right') {
                    return [
                      ...item.contents,
                      {
                        type: 'content',
                        content: ' '.repeat(spaceWid),
                        width: spaceWid,
                      },
                    ];
                  } else if (item.flexible.align === 'center') {
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
    } else if (usedWidth > fullwidth) {
      // Omit
      const allOmitWidth = usedWidth - fullwidth;
      const omitVolume = sum(
        drawList.map((c) =>
          c.type === 'group' && c.flexible?.omit ? c.flexible.omitVolume ?? 1 : 0,
        ),
      );
      // TODO unit * omitVolume !== allOmitWidth
      const unitOmitWid = Math.ceil(allOmitWidth / omitVolume);
      drawContents = compact(
        flatten(
          await Promise.all(
            drawList.map(
              async (
                item,
              ): Promise<DrawableFlatWithWidth | DrawableFlatWithWidth[] | undefined> => {
                if (item.type === 'content') {
                  return item;
                } else if (item.type === 'conceal') {
                  return item;
                } else if (item.type === 'group') {
                  if (!item.flexible?.omit) {
                    return item.contents;
                  }

                  // TODO omitWid may exceed contentWid
                  const omitWid = unitOmitWid * (item.flexible.omitVolume ?? 1);
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

  async flexible(flexible: DrawFlexible | undefined, drawFn: () => any | Promise<any>) {
    const storeList = this.drawableList;
    this.drawableList = [];
    await drawFn();
    storeList.push({
      type: 'group',
      contents: flatten(
        this.drawableList.map((c) => {
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
    });
    this.drawableList = storeList;
  }

  async addColumn<TreeNode extends BaseTreeNode<TreeNode>>(
    node: TreeNode,
    nodeIndex: number,
    column: Column<TreeNode>,
    isLabeling = false,
  ) {
    if (column.concealable) {
      this.drawableList.push({
        type: 'conceal',
        concealStart: column.concealable,
      });
    }
    await column.draw(this, node, {
      nodeIndex,
      isLabeling,
    });
    if (column.concealable) {
      this.drawableList.push({
        type: 'conceal',
        concealEnd: column.concealable,
      });
    }
  }
}
