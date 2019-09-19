import { flatten, chunk, sum, findLast } from '.';
import { flattenChildren } from './array';

test('flatten', () => {
  expect(flatten([1, 2, 3, [4, 5, [6, 7]]])).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('flattenChildren', () => {
  expect(
    flattenChildren([
      {
        id: 1,
      },
      {
        id: 2,
      },
      {
        id: 3,
        children: [
          {
            id: 4,
          },
          {
            id: 5,
            children: [
              {
                id: 6,
              },
              {
                id: 7,
              },
            ],
          },
        ],
      },
    ]).map((item) => {
      item.children = undefined;
      return item;
    }),
  ).toEqual([
    {
      id: 1,
    },
    {
      id: 2,
    },
    {
      id: 3,
    },
    {
      id: 4,
    },
    {
      id: 5,
    },
    {
      id: 6,
    },
    {
      id: 7,
    },
  ]);
});

test('chunk', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

test('sum', () => {
  expect(sum([1, 2, 3, 4, 5])).toEqual(15);
});

test('findLast', () => {
  expect(findLast([1, 2, 3, 4], (it) => it === 3)).toBe(3);
  expect(findLast([1, 2, 3, 4], (it) => it === 5)).toBe(undefined);
});
