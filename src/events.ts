import {
  commands,
  Disposable,
  events,
  workspace,
  ExtensionContext,
} from 'coc.nvim';
import { getEnableDebug } from './config';
import { asyncCatchError, throttle } from './util';

type Arguments<F extends Function> = F extends (...args: infer Args) => any
  ? Args
  : never;

class EventListener<
  F extends (...args: A) => void | Promise<void>,
  A extends any[] = Arguments<F>
> {
  listeners: F[] = [];

  on(func: F, disposables?: Disposable[]) {
    this.listeners.push(func);
    const disposable = Disposable.create(() => {
      const index = this.listeners.indexOf(func);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    });
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
  }

  fire(...args: A) {
    this.listeners.forEach((listener) => {
      listener(...args);
    });
  }
}

type OnEvent = typeof events.on;
type EventResult = void | Promise<void>;
type BufEventListener = (bufnr: number) => EventResult;

export const onEvents: OnEvent = (
  event: any,
  listener: any,
  disposables?: Disposable[],
) => events.on(event, asyncCatchError(listener), disposables);

// onBufEnter
let bufEnterTriggerCount = 0;
const bufEnterListener = new EventListener<BufEventListener, [number]>();

onEvents('BufEnter', (bufnr) => {
  if (getEnableDebug()) {
    // tslint:disable-next-line: ban
    workspace.showMessage(
      `BufEnter: Bufnr(${bufnr}), Count(${bufEnterTriggerCount})`,
      'more',
    );
    bufEnterTriggerCount += 1;
  }

  bufEnterListener.fire(bufnr);
});

export function onBufEnter(
  listener: BufEventListener,
  delay?: number,
  disposables?: Disposable[],
) {
  const listener2 = (bufnr: number) => {
    let prevBufnr = 0;
    if (bufnr !== prevBufnr) {
      prevBufnr = bufnr;
      listener(bufnr);
    }
  };
  const fn =
    delay !== undefined
      ? throttle(delay, listener2, { leading: false, trailing: true })
      : listener2;

  return bufEnterListener.on(fn, disposables);
}

// onCursorMoved
const cursorMovedListener = new EventListener<BufEventListener>();
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

  cursorMovedListener.fire(bufnr);
});

export function onCursorMoved(
  listener: BufEventListener,
  delay?: number,
  disposables?: Disposable[],
) {
  const fn =
    delay !== undefined
      ? throttle(delay, listener, { leading: false, trailing: true })
      : listener;

  return cursorMovedListener.on(fn, disposables);
}

// Internal events
const bufDeleteListener = new EventListener<(bufnr: number) => void>();
const bufWipeoutListener = new EventListener<(bufnr: number) => void>();
const CocDiagnosticChangeListener = new EventListener<() => EventResult>();
const CocGitStatusChangeListener = new EventListener<() => EventResult>();

const internalEventHanders: Record<
  'BufDelete' | 'BufWipeout' | 'CocDiagnosticChange' | 'CocGitStatusChange',
  (...args: any[]) => void
> = {
  BufDelete(args: [number]) {
    bufDeleteListener.fire(...args);
  },
  BufWipeout(args: [number]) {
    bufWipeoutListener.fire(...args);
  },
  CocDiagnosticChange() {
    CocDiagnosticChangeListener.fire();
  },
  CocGitStatusChange() {
    CocGitStatusChangeListener.fire();
  },
};

export function registerBufDeleteEvents(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      'explorer.internal.didVimEvent',
      (event: keyof typeof internalEventHanders, ...args: any[]) =>
        internalEventHanders[event](args),
      undefined,
      true,
    ),
  );
}

export function onBufDelete(listener: BufEventListener) {
  return bufDeleteListener.on(listener);
}

export function onBufWipeout(listener: BufEventListener) {
  return bufWipeoutListener.on(listener);
}

export function onCocDiagnosticChange(listener: () => EventResult) {
  return CocDiagnosticChangeListener.on(listener);
}

export function onCocGitStatusChange(listener: () => EventResult) {
  return CocGitStatusChangeListener.on(listener);
}

// User events
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
