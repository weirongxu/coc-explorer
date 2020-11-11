export const unsigned = (num: number) =>
  typeof num !== 'number' ? 0 : num < 0 ? 0 : Math.floor(num);

const subscriptTable: Record<string, string> = {
  0: '₀',
  1: '₁',
  2: '₂',
  3: '₃',
  4: '₄',
  5: '₅',
  6: '₆',
  7: '₇',
  8: '₈',
  9: '₉',
};
export function toSubscriptNumbers(s: number | string) {
  return s
    .toString()
    .split('')
    .map((c) => subscriptTable[c] ?? c)
    .join('');
}
