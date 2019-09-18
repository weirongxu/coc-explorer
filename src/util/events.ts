import { events } from 'coc.nvim';
import { throttleSingleThread } from './throttle-debounce';
import { onError } from '../logger';

let stopBufEnter = false;
export function onBufEnter(delay: number, callback: (bufnr: number) => void | Promise<void>) {
  const debounceFn = throttleSingleThread(delay, callback);
  events.on('BufEnter', async (bufnr) => {
    if (stopBufEnter) {
      return;
    }
    await debounceFn(bufnr);
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
