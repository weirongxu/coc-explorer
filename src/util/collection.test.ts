import { scanIndexPrev, scanIndexNext } from '.';

describe('scanIndexPrev', () => {
  [
    {
      list: [true, true, true, true, true],
      start: 2,
      wrapscan: true,
      result: 1,
    },
    {
      list: [true, false, true, true, true],
      start: 2,
      wrapscan: true,
      result: 0,
    },
    {
      list: [false, false, true, true, true],
      start: 2,
      wrapscan: true,
      result: 4,
    },
    {
      list: [false, false, true, true, true],
      start: 2,
      wrapscan: false,
      result: null,
    },
    {
      list: [false, false, true, true, false],
      start: 2,
      wrapscan: true,
      result: 3,
    },
    {
      list: [false, false, true, false, false],
      start: 2,
      wrapscan: true,
      result: null,
    },
    {
      list: [false, false, false, true, true],
      start: 0,
      wrapscan: true,
      result: 4,
    },
    {
      list: [false, false, false, true, true],
      start: 0,
      wrapscan: false,
      result: null,
    },
  ].forEach((it, index) => {
    test(index.toString(), () => {
      expect(scanIndexPrev(it.list, it.start, it.wrapscan, (it) => it)).toBe(
        it.result,
      );
    });
  });
});

describe('scanIndexNext', () => {
  [
    {
      list: [true, true, true, true, true],
      start: 2,
      wrapscan: true,
      result: 3,
    },
    {
      list: [true, true, true, false, true],
      start: 2,
      wrapscan: true,
      result: 4,
    },
    {
      list: [true, true, true, false, false],
      start: 2,
      wrapscan: true,
      result: 0,
    },
    {
      list: [true, true, true, false, false],
      start: 2,
      wrapscan: false,
      result: null,
    },
    {
      list: [false, true, true, false, false],
      start: 2,
      wrapscan: true,
      result: 1,
    },
    {
      list: [false, false, true, false, false],
      start: 2,
      wrapscan: true,
      result: null,
    },
    {
      list: [true, true, false, false, false],
      start: 4,
      wrapscan: true,
      result: 0,
    },
    {
      list: [true, true, false, false, false],
      start: 4,
      wrapscan: false,
      result: null,
    },
  ].forEach((it, index) => {
    test(index.toString(), () => {
      expect(scanIndexNext(it.list, it.start, it.wrapscan, (it) => it)).toBe(
        it.result,
      );
    });
  });
});
