import { onBufEnter } from './events';
import { events } from 'coc.nvim';
import { delay } from './util';
import { jestHelper } from 'coc-helper/JestHelper';

jestHelper.boot();

test('onBufEnter', async () => {
  const mockFn = jest.fn();
  onBufEnter(mockFn, 200);
  void events.fire('BufEnter', [1]);
  void events.fire('BufEnter', [2]);
  void events.fire('BufEnter', [3]);
  void events.fire('BufEnter', [4]);
  void events.fire('BufEnter', [5]);
  await delay(50);
  void events.fire('BufEnter', [6]);
  await delay(50);
  expect(mockFn).toBeCalledTimes(0);
  await delay(230);
  expect(mockFn).toBeCalledTimes(1);
  expect(mockFn.mock.calls[0][0]).toBe(6);

  await delay(400);
  expect(mockFn).toBeCalledTimes(1);

  void events.fire('BufEnter', [7]);
  await delay(50);
  expect(mockFn).toBeCalledTimes(1);
  void events.fire('BufEnter', [8]);
  await delay(50);
  expect(mockFn).toBeCalledTimes(1);
  await delay(230);
  expect(mockFn).toBeCalledTimes(2);
  expect(mockFn.mock.calls[1][0]).toBe(8);

  await delay(1000);
  expect(mockFn).toBeCalledTimes(2);

  void events.fire('BufEnter', [9]);
  await delay(230);
  expect(mockFn).toBeCalledTimes(3);
  expect(mockFn.mock.calls[2][0]).toBe(9);
});
