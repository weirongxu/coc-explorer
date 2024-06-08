import { findIndex, findLastIndex } from 'lodash-es';

export { groupBy, max, min, partition, sum, uniq } from 'lodash-es';

export const compactI = <T>(arr: (T | undefined | null | void)[]): T[] =>
  arr.filter((it): it is T => it !== undefined && it !== null);

export function mapGetWithDefault<K, V, M extends Map<K, V>>(
  map: M,
  key: K,
  fetchDefault: () => V,
): V {
  let v = map.get(key);
  if (v === undefined) {
    v = fetchDefault();
    map.set(key, v);
  }
  return v;
}

export function findPair<T>(
  list: T[],
  predicate: (it: T) => boolean,
): [number, T] | [undefined, undefined] {
  const index = list.findIndex(predicate);
  if (index === -1) {
    return [undefined, undefined];
  }
  return [index, list[index]!];
}

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
    return index === -1 ? undefined : index + startIndex + 1;
  }
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
    return index === -1 ? undefined : index;
  }
}
