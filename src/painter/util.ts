import { hlGroupManager } from '../highlight/manager';
import {
  compactI,
  displaySlice,
  displayWidth,
  flatten,
  isASCII,
  sum,
} from '../util';
import {
  Drawable,
  DrawableWithWidth,
  DrawContent,
  DrawContentWithWidth,
  DrawnWithIndexRange,
  DrawnWithNodeIndex,
} from './types';

export function drawnWithIndexRange(
  drawnList: DrawnWithNodeIndex[],
): DrawnWithIndexRange[] {
  if (!drawnList.length) {
    return [];
  }

  const sortedDrawnList = drawnList.sort((a, b) => a.nodeIndex - b.nodeIndex);
  const drawnRangeList: DrawnWithIndexRange[] = [];
  let drawnRangeCur: DrawnWithIndexRange | undefined;

  for (let i = 0, len = sortedDrawnList.length; i < len; i++) {
    const drawn = sortedDrawnList[i];
    if (!drawnRangeCur) {
      drawnRangeCur = {
        nodeIndexStart: drawn.nodeIndex,
        nodeIndexEnd: drawn.nodeIndex,
        drawnList: [drawn],
      };
    } else if (drawnRangeCur.nodeIndexEnd + 1 === drawn.nodeIndex) {
      drawnRangeCur.drawnList.push(drawn);
      drawnRangeCur.nodeIndexEnd = drawn.nodeIndex;
    } else {
      drawnRangeList.push(drawnRangeCur);
      i--;
      drawnRangeCur = undefined;
    }
  }

  if (drawnRangeCur) {
    drawnRangeList.push(drawnRangeCur);
  }
  return drawnRangeList;
}

export const isEmptyDrawableList = (drawableList: Drawable[]) =>
  sum(
    drawableList.map((p) =>
      p.type === 'content'
        ? p.content.length
        : p.type === 'group'
        ? sum(
            p.contents.map((c) =>
              c.type === 'content' ? c.content.length : 0,
            ),
          )
        : 0,
    ),
  ) === 0;

export async function fetchDisplayWidth(
  drawableList: Drawable[],
): Promise<DrawableWithWidth[]> {
  async function getDrawContentWith(
    drawable: DrawContent,
  ): Promise<DrawContentWithWidth> {
    return {
      ...drawable,
      width:
        drawable.unicode && !isASCII(drawable.content)
          ? await displayWidth(drawable.content)
          : drawable.content.length,
    };
  }
  return compactI(
    flatten(
      await Promise.all(
        drawableList.map(async (it) => {
          if (it.type === 'content') {
            return await getDrawContentWith(it);
          } else if (it.type === 'group') {
            return {
              ...it,
              contents: await Promise.all(
                compactI(
                  it.contents.map((c) =>
                    c.type === 'content' ? getDrawContentWith(c) : undefined,
                  ),
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

export function divideVolumeBy(
  totalWidth: number,
  volumes: number[],
  widthLimit?: number[],
) {
  let unit = totalWidth / sum(volumes);
  const widthes: number[] = new Array(volumes.length);
  if (widthLimit) {
    for (let i = 0; i < volumes.length; i++) {
      const width = Math.ceil(volumes[i] * unit);
      if (width > widthLimit[i]) {
        widthes[i] = widthLimit[i];
        totalWidth -= widthLimit[i];
        volumes[i] = 0;
      }
    }
    unit = totalWidth / sum(volumes);
  }
  for (let i = 0; i < volumes.length; i++) {
    if (widthes[i] === undefined) {
      const width = Math.ceil(volumes[i] * unit);
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

export async function handlePadding(
  drawableList: DrawableWithWidth[],
): Promise<DrawableWithWidth[]> {
  return drawableList.map((it) => {
    if (
      it.type === 'group' &&
      it.flexible?.padding &&
      it.flexible.paddingVolume
    ) {
      const width = sum(
        it.contents.map((c) => (c.type === 'content' ? c.width : 0)),
      );
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

export async function handleGrow(
  fullwidth: number,
  usedWidth: number,
  drawableList: DrawableWithWidth[],
): Promise<DrawContentWithWidth[]> {
  const allSpaceWidth = fullwidth - usedWidth;
  const spaceWids = divideVolumeBy(
    allSpaceWidth,
    drawableList.map((c) =>
      c.type === 'group' && c.flexible?.grow ? c.flexible.growVolume ?? 1 : 0,
    ),
  );
  return compactI(
    flatten(
      await Promise.all(
        drawableList.map(
          async (
            item,
            idx,
          ): Promise<
            DrawContentWithWidth | DrawContentWithWidth[] | undefined
          > => {
            if (item.type === 'content') {
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

const omitSymbolHighlight = hlGroupManager.linkGroup(
  'OmitSymbol',
  'SpecialComment',
);

export async function handleOmit(
  fullwidth: number,
  usedWidth: number,
  drawableList: DrawableWithWidth[],
): Promise<DrawContentWithWidth[]> {
  const allOmitWidth = usedWidth - fullwidth;
  const omitWids = divideVolumeBy(
    allOmitWidth,
    drawableList.map((c) =>
      c.type === 'group' && c.flexible?.omit ? c.flexible.omitVolume ?? 1 : 0,
    ),
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
  return compactI(
    flatten(
      await Promise.all(
        drawableList.map(
          async (
            item,
            idx,
          ): Promise<
            DrawContentWithWidth | DrawContentWithWidth[] | undefined
          > => {
            if (item.type === 'content') {
              return item;
            } else if (item.type === 'group') {
              if (!item.flexible?.omit) {
                return item.contents;
              }

              const omitWid = omitWids[idx];
              const contents: DrawContentWithWidth[] = [];

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
                  item.contents.map((c) =>
                    c.type === 'content' ? c.width : 0,
                  ),
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
                  item.contents.map((c) =>
                    c.type === 'content' ? c.width : 0,
                  ),
                );
                const cutWid = omitWid + 1;
                const remainWid = contentWid - cutWid;
                const leftCutPos = Math.floor(remainWid / 2);
                const rightCutPos = contentWid - (remainWid - leftCutPos);
                let itemStartPos = 0;
                let itemEndPos = 0;
                const contents: DrawContentWithWidth[] = [];
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
                        content: await displaySlice(
                          c.content,
                          c.width - rightWidth,
                        ),
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
