import { byteIndex, byteLength, splitCount } from './string';

test('byteIndex', () => {
  expect(byteIndex('aa', 1)).toBe(1);
  expect(byteIndex('古古', 1)).toBe(3);
});

test('byteLength', () => {
  expect(byteLength('aa')).toBe(2);
  expect(byteLength('古古')).toBe(6);
});

test('splitCount', () => {
  expect(splitCount('--hello=test=hello', '=', 1)).toEqual([
    '--hello=test=hello',
  ]);
  expect(splitCount('--hello=test=hello', '=')).toEqual([
    '--hello',
    'test=hello',
  ]);
  expect(splitCount('--hello=test=hello', '=', 2)).toEqual([
    '--hello',
    'test=hello',
  ]);
  expect(splitCount('--hello=test=hello', '=', 3)).toEqual([
    '--hello',
    'test',
    'hello',
  ]);
});
