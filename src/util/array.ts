export function flatten<T>(arr: T[]) {
  const stack = [...arr];
  const res = [];
  while (stack.length) {
    const item = stack.shift()!;
    if (Array.isArray(item)) {
      stack.unshift(...item);
    } else {
      res.push(item);
    }
  }
  return res;
}

export function chunk<T>(array: T[], size: number = 1): T[][] {
  const finalSize = Math.max(size, 0);
  if (!array.length || size < 1) {
    return [];
  }
  const result: T[][] = [];
  for (let i = 0; i < Math.ceil(array.length / finalSize); i++) {
    result.push(array.slice(i * size, (i + 1) * size));
  }
  return result;
}

export const sum = (list: number[]) => list.reduce((result, item) => result + item, 0);

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
