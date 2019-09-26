import { events } from 'coc.nvim';
import { throttle } from './throttle-debounce';
import { onError } from '../logger';

let stopBufEnter = false;
export function onBufEnter(delay: number, callback: (bufnr: number) => void | Promise<void>) {
  const throttleFn = throttle(delay, callback, { tail: true });
  events.on('BufEnter', async (bufnr) => {
    if (stopBufEnter) {
      return;
    }
    await throttleFn(bufnr);
  });
}

export async function avoidOnBufEnter(block: () => Promise<void>) {
  stopBufEnter = true;
  try {
    await block();
  } catch (error) {
    onError(error);
  }
  stopBufEnter = false;
}
