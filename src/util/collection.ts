import { findIndex, findLastIndex } from 'lodash-es';

export {
  max,
  min,
  partition,
  groupBy,
  flatten,
  flattenDeep,
  sum,
  uniq,
  findIndex,
  findLastIndex,
} from 'lodash-es';

export const compactI = <T>(arr: (T | undefined | null | void)[]): T[] =>
  arr.filter((it): it is T => it !== undefined && it !== null);

export function scanIndexPrev<T>(
  list: T[],
  startIndex: number,
  wrapscan: boolean,
  condition: (it: T) => boolean,
) {
  if (startIndex > 0) {
    const index = findLastIndex(list, condition, startIndex - 1);
    if (index !== -1) {
      return index;
    }
  }
  if (wrapscan && startIndex < list.length - 1) {
    const index = findLastIndex(list.slice(startIndex + 1), condition);
    return index === -1 ? null : index + startIndex + 1;
  }
  return null;
}

export function scanIndexNext<T>(
  list: T[],
  startIndex: number,
  wrapscan: boolean,
  condition: (it: T) => boolean,
) {
  if (startIndex < list.length - 1) {
    const index = findIndex(list, condition, startIndex + 1);
    if (index !== -1) {
      return index;
    }
  }
  if (wrapscan && startIndex > 0) {
    const index = findIndex(list.slice(0, startIndex), condition);
    return index === -1 ? null : index;
  }
  return null;
}
