export {
  max,
  min,
  partition,
  groupBy,
  flatten,
  flattenDeep,
  sum,
  uniq,
} from 'lodash-es';

export const compactI = <T>(arr: (T | undefined | null | void)[]): T[] =>
  arr.filter((it): it is T => it !== undefined && it !== null);
