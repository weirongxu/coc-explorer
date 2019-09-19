import { byteIndex, byteLength } from './string';

test('byteIndex', () => {
  expect(byteIndex('aa', 1)).toBe(1);
  expect(byteIndex('古古', 1)).toBe(3);
});

test('byteLength', () => {
  expect(byteLength('aa')).toBe(2);
  expect(byteLength('古古')).toBe(6);
});
