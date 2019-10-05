import { flatten, chunk, sum, findLast, max, min } from '.';

test('flatten', () => {
  expect(flatten([1, 2, 3, [4, 5, [6, 7]]])).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('chunk', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

test('sum', () => {
  expect(sum([1, 2, 3, 4, 5])).toEqual(15);
});

test('max', () => {
  expect(max([1, 2, 3, 4, 5])).toEqual(5);
});

test('min', () => {
  expect(min([1, 2, 3, 4, 5])).toEqual(1);
});

test('findLast', () => {
  expect(findLast([1, 2, 3, 4], (it) => it === 3)).toBe(3);
  expect(findLast([1, 2, 3, 4], (it) => it === 5)).toBe(undefined);
});
