import {
  commands,
  Disposable,
  events,
  workspace,
  ExtensionContext,
} from 'coc.nvim';
import { getEnableDebug } from './config';
import { asyncCatchError, throttle } from './util';

type OnEvent = typeof events.on;
type EventResult = void | Promise<void>;
type BufEventHandler = (bufnr: number) => EventResult;

export const onEvents: OnEvent = (
  event: any,
  handler: any,
  disposables?: Disposable[],
) => events.on(event, asyncCatchError(handler), disposables);

// onBufEnter
const onBufEnterHandlers: BufEventHandler[] = [];
let onBufEnterTriggerCount = 0;

onEvents('BufEnter', (bufnr) => {
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
  const handler2 = (bufnr: number) => {
    let prevBufnr = 0;
    if (bufnr !== prevBufnr) {
      prevBufnr = bufnr;
      handler(bufnr);
    }
  };
  const fn =
    delay !== undefined
      ? throttle(delay, handler2, { leading: false, trailing: true })
      : handler2;

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

export function registerBufDeleteEvents(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      'explorer.internal.didVimEvent',
      asyncCatchError((event, ...args: any[]) => {
        if (event === 'BufDelete') {
          onBufDeleteHandlers.forEach((handler) => {
            handler(...(args as [number]));
          });
        } else if (event === 'BufWipeout') {
          onBufWipeoutHandlers.forEach((handler) => {
            handler(...(args as [number]));
          });
        }
      }),
      undefined,
      true,
    ),
  );
}

const onBufDeleteHandlers: BufEventHandler[] = [];
const onBufWipeoutHandlers: BufEventHandler[] = [];

export function onBufDelete(handler: BufEventHandler) {
  onBufDeleteHandlers.push(handler);

  const disposable = Disposable.create(() => {
    const index = onBufDeleteHandlers.indexOf(handler);
    if (index !== -1) {
      onBufDeleteHandlers.splice(index, 1);
    }
  });

  onBufDeleteHandlers.push(handler);

  return disposable;
}

export function onBufWipeout(handler: BufEventHandler) {
  onBufWipeoutHandlers.push(handler);

  const disposable = Disposable.create(() => {
    const index = onBufWipeoutHandlers.indexOf(handler);
    if (index !== -1) {
      onBufWipeoutHandlers.splice(index, 1);
    }
  });

  onBufWipeoutHandlers.push(handler);

  return disposable;
}

export async function doCocExplorerOpenPre() {
  await workspace.nvim.command('doautocmd User CocExplorerOpenPre');
}

export async function doCocExplorerOpenPost() {
  await workspace.nvim.command('doautocmd User CocExplorerOpenPost');
}

export async function doCocExplorerQuitPre() {
  await workspace.nvim.command('doautocmd User CocExplorerQuitPre');
}

export async function doCocExplorerQuitPost() {
  await workspace.nvim.command('doautocmd User CocExplorerQuitPost');
}
