import {
  commands,
  Disposable,
  events,
  ExtensionContext,
  workspace,
} from 'coc.nvim';
import { LiteralUnion } from 'type-fest';
import { onError } from './logger';
import { asyncCatchError, debounce, Notifier, throttle } from './util';

type Arguments<F extends Function> = F extends (...args: infer Args) => any
  ? Args
  : never;

type EventResult = void | Promise<void>;
type EventListener = (...args: any[]) => EventResult;
type BufEventListener = (bufnr: number) => EventResult;

// event with asyncCatchError
export const onEvent: typeof events.on = (
  event: any,
  listener: any,
  thisArgs: any,
  disposables?: Disposable[],
) => {
  const disposable = events.on(event, asyncCatchError(listener), thisArgs);
  const finalDisposable = Disposable.create(() => {
    if (typeof listener.cancel === 'function') {
      listener.cancel();
    }
    disposable.dispose();
  });
  if (disposables) {
    disposables.push(finalDisposable);
  }
  return finalDisposable;
};

// onBufEnter
export function onBufEnter(
  listener: BufEventListener,
  delay: number,
  disposables?: Disposable[],
) {
  let prevBufnr = 0;

  const handler =
    delay !== 0
      ? debounce(delay, (bufnr: number) => {
          if (bufnr !== prevBufnr) {
            prevBufnr = bufnr;
            return listener(bufnr);
          }
        })
      : listener;

  return onEvent('BufEnter', handler, undefined, disposables);
}

// onCursorMoved
export function onCursorMoved(
  listener: BufEventListener,
  delay: number,
  disposables?: Disposable[],
) {
  const handler = throttle(delay, listener, { leading: false, trailing: true });

  return onEvent('CursorMoved', handler, undefined, disposables);
}

export class InternalEventEmitter<
  Events extends Record<string, EventListener>
> {
  listenersMap = new Map<keyof Events, EventListener[]>();

  constructor(public concurrent = false) {}

  listeners(event: keyof Events): EventListener[] {
    if (!this.listenersMap.has(event)) {
      const listeners: EventListener[] = [];
      this.listenersMap.set(event, listeners);
      return listeners;
    }
    return this.listenersMap.get(event)!;
  }

  on<E extends keyof Events>(
    event: E,
    listener: Events[E],
    disposables?: Disposable[],
  ) {
    this.listeners(event as string).push(listener);
    const disposable = Disposable.create(() => this.off(event, listener));
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
  }

  off<E extends keyof Events>(event: E, listener: Events[E]) {
    // @ts-ignore
    if (typeof listener.cancel === 'function') {
      // @ts-ignore
      listener.cancel();
    }
    const listeners = this.listeners(event as string);
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  async fire<E extends keyof Events>(event: E, ...args: Arguments<Events[E]>) {
    if (this.concurrent) {
      await Promise.all(
        this.listeners(event as string).map(async (listener) => {
          try {
            await listener(...args);
          } catch (e) {
            onError(e);
          }
        }),
      );
    } else {
      for (const listener of this.listeners(event as string)) {
        try {
          await listener(...args);
        } catch (e) {
          onError(e);
        }
      }
    }
  }
}

// Internal events
export const internalEvents = new InternalEventEmitter<{
  BufDelete: BufEventListener;
  BufWipeout: BufEventListener;
  CocDiagnosticChange: () => EventResult;
  CocGitStatusChange: () => EventResult;
  CocBookmarkChange: () => EventResult;
}>();

export function registerInternalEvents(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      'explorer.internal.didVimEvent',
      asyncCatchError((event: any, ...args: any[]) =>
        internalEvents.fire(event, ...args),
      ),
      undefined,
      true,
    ),
  );
}

// User events
export type CocExplorerUserEvents = LiteralUnion<
  | 'CocExplorerOpenPre'
  | 'CocExplorerOpenPost'
  | 'CocExplorerQuitPre'
  | 'CocExplorerQuitPost',
  string
>;

export function doUserAutocmdNotifier(name: CocExplorerUserEvents) {
  return Notifier.create(() => {
    workspace.nvim.call('coc_explorer#do_autocmd', [name], true);
  });
}

export async function doUserAutocmd(name: CocExplorerUserEvents) {
  await doUserAutocmdNotifier(name).run();
}
