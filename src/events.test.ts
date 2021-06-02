import { onBufEnter } from './events';
import { events } from 'coc.nvim';
import { sleep } from './util';
import { jestHelper } from 'coc-helper/JestHelper';

jestHelper.boot();

function fireBufEnter(args: [number]) {
  // @ts-ignore
  void events.fire('BufEnter', args);
}

test('onBufEnter', async () => {
  const mockFn = jest.fn();
  onBufEnter(mockFn, 200);
  void fireBufEnter([1]);
  void fireBufEnter([2]);
  void fireBufEnter([3]);
  void fireBufEnter([4]);
  void fireBufEnter([5]);
  await sleep(50);
  void fireBufEnter([6]);
  await sleep(50);
  expect(mockFn).toBeCalledTimes(0);
  await sleep(230);
  expect(mockFn).toBeCalledTimes(1);
  expect(mockFn.mock.calls[0][0]).toBe(6);

  await sleep(400);
  expect(mockFn).toBeCalledTimes(1);

  void fireBufEnter([7]);
  await sleep(50);
  expect(mockFn).toBeCalledTimes(1);
  void fireBufEnter([8]);
  await sleep(50);
  expect(mockFn).toBeCalledTimes(1);
  await sleep(230);
  expect(mockFn).toBeCalledTimes(2);
  expect(mockFn.mock.calls[1][0]).toBe(8);

  await sleep(1000);
  expect(mockFn).toBeCalledTimes(2);

  void fireBufEnter([9]);
  await sleep(230);
  expect(mockFn).toBeCalledTimes(3);
  expect(mockFn.mock.calls[2][0]).toBe(9);
});
