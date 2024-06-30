import { hlGroupManager } from '../highlight/manager';
import { compactI, displaySlice, displayWidth, isASCII, sum } from '../util';
import type {
  Drawable,
  DrawableWithWidth,
  DrawContent,
  DrawContentWithWidth,
  DrawnWithIndexRange,
  DrawnWithNodeIndex,
  DrawUnknown,
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
    const drawn = sortedDrawnList[i]!;
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
  const list = await Promise.all(
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
  );
  return compactI(list.flat());
}

export function divideVolumeBy(
  totalWidth: number,
  volumes: number[],
  widthLimits?: number[],
) {
  let unit = totalWidth / sum(volumes);
  const widths: number[] = new Array(volumes.length);
  if (widthLimits) {
    for (let i = 0; i < volumes.length; i++) {
      const volume = volumes[i];
      const widthLimit = widthLimits[i];
      if (!volume || !widthLimit) continue;
      const width = Math.ceil(volume * unit);
      if (width > widthLimit) {
        widths[i] = widthLimit;
        totalWidth -= widthLimit;
        volumes[i] = 0;
      }
    }
    unit = totalWidth / sum(volumes);
  }
  for (let i = 0; i < volumes.length; i++) {
    if (widths[i] === undefined) {
      const volume = volumes[i];
      if (!volume) continue;
      const width = Math.ceil(volume * unit);
      if (width <= totalWidth) {
        totalWidth -= width;
        widths[i] = width;
      } else {
        widths[i] = totalWidth;
      }
    }
  }
  return widths;
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
        switch (it.flexible.padding) {
          case 'left':
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
          case 'right':
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
          case 'center': {
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
          }
          default:
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
): Promise<(DrawContentWithWidth | DrawUnknown)[]> {
  const allSpaceWidth = fullwidth - usedWidth;
  const spaceWidths = divideVolumeBy(
    allSpaceWidth,
    drawableList.map((c) =>
      c.type === 'group' && c.flexible?.grow ? c.flexible.growVolume ?? 1 : 0,
    ),
  );
  const list = await Promise.all(
    drawableList.map(
      async (
        item,
        idx,
      ): Promise<
        | DrawContentWithWidth
        | (DrawContentWithWidth | DrawUnknown)[]
        | undefined
      > => {
        if (item.type === 'content') {
          return item;
        } else if (item.type === 'group') {
          if (!item.flexible?.grow) {
            return item.contents;
          }

          const spaceWidth = spaceWidths[idx];
          if (!spaceWidth) return;

          switch (item.flexible.grow) {
            case 'left':
              return [
                {
                  type: 'content',
                  content: ' '.repeat(spaceWidth),
                  width: spaceWidth,
                },
                ...item.contents,
              ];
            case 'right':
              return [
                ...item.contents,
                {
                  type: 'content',
                  content: ' '.repeat(spaceWidth),
                  width: spaceWidth,
                },
              ];
            case 'center': {
              const leftSpace = Math.floor(spaceWidth / 2);
              const rightSpace = spaceWidth - leftSpace;
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
            }
            default:
              return item.contents;
          }
        }
      },
    ),
  );
  return compactI(list.flat());
}

const omitSymbolHighlight = hlGroupManager.linkGroup(
  'OmitSymbol',
  'SpecialComment',
);

export async function handleOmit(
  fullwidth: number,
  usedWidth: number,
  drawableList: DrawableWithWidth[],
): Promise<(DrawContentWithWidth | DrawUnknown)[]> {
  const allOmitWidth = usedWidth - fullwidth;
  const omitWidths = divideVolumeBy(
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

  const list = await Promise.all(
    drawableList.map(
      async (
        item,
        idx,
      ): Promise<
        | DrawContentWithWidth
        | (DrawContentWithWidth | DrawUnknown)[]
        | undefined
      > => {
        if (item.type === 'content') {
          return item;
        } else if (item.type === 'group') {
          if (!item.flexible?.omit) {
            return item.contents;
          }

          const omitWidth = omitWidths[idx];
          if (!omitWidth) return;
          const contents: (DrawContentWithWidth | DrawUnknown)[] = [];

          switch (item.flexible.omit) {
            case 'left': {
              const cutWidth = omitWidth + 1;
              let remainCutWidth = cutWidth;
              for (const c of item.contents) {
                if (c.type !== 'content') {
                  contents.push(c);
                  continue;
                }

                if (remainCutWidth < 0) {
                  contents.push(c);
                } else if (remainCutWidth < c.width) {
                  contents.push({
                    type: 'content',
                    content: '‥',
                    width: 1,
                    group: omitSymbolHighlight.group,
                  });
                  if (remainCutWidth > 0) {
                    contents.push({
                      ...c,
                      content: await displaySlice(c.content, remainCutWidth),
                      width: c.width - remainCutWidth,
                    });
                  }
                }
                remainCutWidth -= c.width;
              }
              return contents;
            }
            case 'right': {
              const cutWidth = omitWidth + 1;
              const contentWidth = sum(
                item.contents.map((c) => (c.type === 'content' ? c.width : 0)),
              );
              let remainWidth = contentWidth - cutWidth;
              for (const c of item.contents) {
                if (c.type !== 'content') {
                  contents.push(c);
                  continue;
                }

                if (remainWidth >= c.width) {
                  contents.push(c);
                } else if (remainWidth < c.width) {
                  if (remainWidth > 0) {
                    contents.push({
                      ...c,
                      content: await displaySlice(c.content, 0, remainWidth),
                      width: remainWidth,
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
                remainWidth -= c.width;
              }
              return contents;
            }
            case 'center': {
              const contentWidth = sum(
                item.contents.map((c) => (c.type === 'content' ? c.width : 0)),
              );
              const cutWidth = omitWidth + 1;
              const remainWidth = contentWidth - cutWidth;
              const leftCutPos = Math.floor(remainWidth / 2);
              const rightCutPos = contentWidth - (remainWidth - leftCutPos);
              let itemStartPos = 0;
              let itemEndPos = 0;
              const contents: (DrawContentWithWidth | DrawUnknown)[] = [];
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
        }
      },
    ),
  );
  return compactI(list.flat());
}
