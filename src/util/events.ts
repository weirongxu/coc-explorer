import { events, workspace, Disposable } from 'coc.nvim';
import { getEnableDebug } from './config';
import { throttle } from './throttle-debounce';
import { asyncCatchError } from './function';

type OnEvent = typeof events.on;
type EventResult = void | Promise<void>;
type BufEventHandler = (bufnr: number) => EventResult;

export const onEvents: OnEvent = (event: any, handler: any, disposables?: Disposable[]) =>
  events.on(event, asyncCatchError(handler), disposables);

let stopBufEvent = false;

// onBufEnter
const skipOnBufEnterBufnrs: number[] = [];
const onBufEnterHandlers: BufEventHandler[] = [];
let onBufEnterTriggerCount = 0;

onEvents('BufEnter', (bufnr) => {
  if (stopBufEvent) {
    return;
  }

  const skipIndex = skipOnBufEnterBufnrs.indexOf(bufnr);
  if (skipIndex !== -1) {
    skipOnBufEnterBufnrs.splice(skipIndex, 1);
    return;
  }

  if (getEnableDebug()) {
    // tslint:disable-next-line: ban
    workspace.showMessage(`BufEnter: Bufnr(${bufnr}), Count(${onBufEnterTriggerCount})`, 'more');
    onBufEnterTriggerCount += 1;
  }

  onBufEnterHandlers.forEach((handler) => {
    handler(bufnr);
  });
});

export function onBufEnter(handler: BufEventHandler, delay?: number, disposables?: Disposable[]) {
  const fn = delay !== undefined ? throttle(delay, handler, { tail: true }) : handler;
  const disposable = Disposable.create(() => {
    const index = onBufEnterHandlers.indexOf(fn);

    if (index !== -1) {
      onBufEnterHandlers.splice(index, 1);
    }
  });
  disposables?.push(disposable);
  onBufEnterHandlers.push(fn);
  return disposable;
}

// onCursorMoved
const skipOnCursorMovedBufnrs: number[] = [];
const onCursorMovedHandlers: BufEventHandler[] = [];
let onCursorMovedTriggerCount = 0;

onEvents('CursorMoved', (bufnr) => {
  if (stopBufEvent) {
    return;
  }

  const skipIndex = skipOnCursorMovedBufnrs.indexOf(bufnr);
  if (skipIndex !== -1) {
    skipOnCursorMovedBufnrs.splice(skipIndex, 1);
    return;
  }

  if (getEnableDebug()) {
    // tslint:disable-next-line: ban
    workspace.showMessage(
      `CursorMoved: Bufnr(${bufnr}), Count(${onCursorMovedTriggerCount})`,
      'more',
    );
    onCursorMovedTriggerCount += 1;
  }

  onCursorMovedHandlers.forEach((handler) => {
    handler(bufnr);
  });
});

export function onCursorMoved(
  handler: BufEventHandler,
  delay?: number,
  disposables?: Disposable[],
) {
  const fn = delay !== undefined ? throttle(delay, handler, { tail: true }) : handler;
  const disposable = Disposable.create(() => {
    const index = onCursorMovedHandlers.indexOf(fn);

    if (index !== -1) {
      onCursorMovedHandlers.splice(index, 1);
    }
  });
  disposables?.push(disposable);
  onCursorMovedHandlers.push(fn);
  return disposable;
}

// Skip
export function skipOnEvents(bufnrs: number[]) {
  skipOnCursorMovedBufnrs.push(...bufnrs);
  skipOnBufEnterBufnrs.push(...bufnrs);
}

export async function skipOnEventsByWinnrs(winnrs: number[]) {
  const bufnrs = (await workspace.nvim.eval(
    `map([${winnrs.join(',')}], {idx, winnr -> winbufnr(winnr)})`,
  )) as number[];
  skipOnEvents(bufnrs);
}

export async function avoidOnBufEvents<R>(block: () => Promise<R>) {
  let result: R;
  try {
    stopBufEvent = true;
    result = await block();
    return result;
  } catch (error) {
    throw error;
  } finally {
    stopBufEvent = false;
  }
}
