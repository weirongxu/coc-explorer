import { max, min } from '.';

test('max', () => {
  expect(max([1, 2, 3, 4, 5])).toEqual(5);
});

test('min', () => {
  expect(min([1, 2, 3, 4, 5])).toEqual(1);
});
