export function findLastIndex<T>(list: T[], predicate: (item: T) => boolean): number {
  let idx = list.length - 1;
  while (idx >= 0) {
    if (predicate(list[idx])) {
      return idx;
    }
    idx -= 1;
  }
  return -1;
}

export function findLast<T>(list: T[], predicate: (item: T) => boolean): T | undefined {
  let idx = list.length - 1;
  while (idx >= 0) {
    if (predicate(list[idx])) {
      return list[idx];
    }
    idx -= 1;
  }
  return undefined;
}
