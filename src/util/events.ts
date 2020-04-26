import { events, workspace, Disposable } from 'coc.nvim';
import { getEnableDebug } from './config';
import { throttle } from './throttle-debounce';
import { asyncCatchError } from './function';

type OnEvent = typeof events.on;
type EventResult = void | Promise<void>;
type BufEventHandler = (bufnr: number) => EventResult;

export const onEvents: OnEvent = (
  event: any,
  handler: any,
  disposables?: Disposable[],
) => events.on(event, asyncCatchError(handler), disposables);

let stopBufEvent = false;

// onBufEnter
const onBufEnterHandlers: BufEventHandler[] = [];
let onBufEnterTriggerCount = 0;

onEvents('BufEnter', (bufnr) => {
  if (stopBufEvent) {
    return;
  }

  if (getEnableDebug()) {
    // tslint:disable-next-line: ban
    workspace.showMessage(
      `BufEnter: Bufnr(${bufnr}), Count(${onBufEnterTriggerCount})`,
      'more',
    );
    onBufEnterTriggerCount += 1;
  }

  onBufEnterHandlers.forEach((handler) => {
    handler(bufnr);
  });
});

export function onBufEnter(
  handler: BufEventHandler,
  delay?: number,
  disposables?: Disposable[],
) {
  const fn =
    delay !== undefined
      ? throttle(delay, handler, { leading: false, trailing: true })
      : handler;

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
const onCursorMovedHandlers: BufEventHandler[] = [];
let onCursorMovedTriggerCount = 0;

onEvents('CursorMoved', (bufnr) => {
  if (stopBufEvent) {
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
  const fn =
    delay !== undefined
      ? throttle(delay, handler, { leading: false, trailing: true })
      : handler;

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
