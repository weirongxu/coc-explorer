import { events, workspace, Disposable } from 'coc.nvim';
import { enableDebug } from './config';
import { throttle } from './throttle-debounce';
import { asyncCatchError } from './function';

type OnEvent = typeof events.on;

export const onEvents: OnEvent = (event: any, handler: any, disposables?: Disposable[]) =>
  events.on(event, asyncCatchError(handler), disposables);

let stopBufEnter = false;
const skipBufnrQueue: number[] = [];
let count = 0;

export function onBufEnter(delay: number, callback: (bufnr: number) => void | Promise<void>) {
  const throttleFn = throttle(delay, callback, { tail: true });
  return onEvents('BufEnter', async (bufnr) => {
    if (stopBufEnter) {
      return;
    }
    const skipIndex = skipBufnrQueue.indexOf(bufnr);
    if (skipIndex !== -1) {
      skipBufnrQueue.splice(skipIndex, 1);
      return;
    }
    if (enableDebug) {
      // tslint:disable-next-line: ban
      workspace.showMessage(`BufEnter: Bufnr(${bufnr}), Count(${count++})`, 'more');
    }
    throttleFn(bufnr);
  });
}

export function skipOnBufEnter(bufnrs: number[]) {
  skipBufnrQueue.push(...bufnrs);
}

export async function avoidOnBufEnter<R>(block: () => Promise<R>) {
  let result: R;
  try {
    stopBufEnter = true;
    result = await block();
    return result;
  } catch (error) {
    throw error;
  } finally {
    stopBufEnter = false;
  }
}
