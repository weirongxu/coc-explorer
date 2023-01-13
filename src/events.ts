import { HelperEventEmitter, Notifier } from 'coc-helper';
import {
  Disposable,
  Emitter,
  events,
  ExtensionContext,
  workspace,
} from 'coc.nvim';
import { LiteralUnion } from 'type-fest';
import { debounceFn, logger, throttleFn } from './util';

type EventResult = any | Promise<any>;
type BufEventListener = (bufnr: number) => EventResult;

// event with asyncCatch
export const onEvent: typeof events.on = (
  event: any,
  listener: any,
  thisArgs: any,
  disposables?: Disposable[],
) => {
  const disposable = events.on(event, logger.asyncCatch(listener), thisArgs);
  const finalDisposable = Disposable.create(() => {
    if (typeof listener.cancel === 'function') {
      listener.cancel();
    }
    if (typeof listener.dispose === 'function') {
      listener.dispose();
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
      ? debounceFn(delay, (bufnr: number) => {
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
  const handler = throttleFn(delay, listener, {
    leading: false,
    trailing: true,
  });

  return onEvent('CursorMoved', handler, undefined, disposables);
}

// Internal events
type Event = {
  BufDelete: BufEventListener;
  BufWipeout: BufEventListener;
  TabEnter: BufEventListener;
  ColorScheme: (scheme: string) => EventResult;
  CocDiagnosticChange: () => EventResult;
  CocGitStatusChange: () => EventResult;
  FugitiveChanged: () => EventResult;
  CocBookmarkChange: () => EventResult;
};

export function registerInternalEvents(context: ExtensionContext) {
  const eventList: [user: boolean, event: keyof Event, arglist: string[]][] = [
    [false, 'BufDelete', ['+expand("<abuf>")']],
    [false, 'BufWipeout', ['+expand("<abuf>")']],
    [false, 'TabEnter', ['+expand("<abuf>")']],
    [false, 'ColorScheme', ['g:colors_name']],
    [true, 'CocDiagnosticChange', []],
    [true, 'CocGitStatusChange', []],
    [true, 'FugitiveChanged', []],
    [true, 'CocBookmarkChange', []],
  ];

  context.subscriptions.push(
    ...eventList.map(([user, event, arglist]) =>
      workspace.registerAutocmd({
        event: user ? `User ${event}` : event,
        arglist,
        callback: async (...args: any) => {
          await internalEvents.fire(event, ...args);
        },
      }),
    ),
  );
}

export const internalEvents = new HelperEventEmitter<Event>(logger);

export const cocListCloseEmitter = new Emitter<void>();

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
    workspace.nvim.call('coc_explorer#util#do_autocmd', [name], true);
  });
}

export async function doUserAutocmd(name: CocExplorerUserEvents) {
  await doUserAutocmdNotifier(name).run();
}
