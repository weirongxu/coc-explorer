import { HelperVimEvents, Notifier } from 'coc-helper';
import { Disposable, Emitter, events, workspace } from 'coc.nvim';
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

export const InternalVimEvents = new HelperVimEvents<{
  BufDelete: BufEventListener;
  BufWipeout: BufEventListener;
  ColorScheme: (scheme: string) => EventResult;
  CocDiagnosticChange: () => EventResult;
  CocGitStatusChange: () => EventResult;
  FugitiveChanged: () => EventResult;
  CocBookmarkChange: () => EventResult;
}>(
  {
    BufDelete: {
      eventExpr: 'BufDelete *',
      argExprs: ['+expand("<abuf>")'],
    },
    BufWipeout: {
      eventExpr: 'BufWipeout *',
      argExprs: ['+expand("<abuf>")'],
    },
    ColorScheme: {
      eventExpr: 'ColorScheme *',
      argExprs: ['g:colors_name'],
    },
    CocDiagnosticChange: {
      eventExpr: 'User CocDiagnosticChange',
    },
    CocGitStatusChange: {
      eventExpr: 'User CocGitStatusChange',
    },
    FugitiveChanged: {
      eventExpr: 'User FugitiveChanged',
    },
    CocBookmarkChange: {
      eventExpr: 'User CocBookmarkChange',
    },
  },
  logger,
  {
    name: 'explorer',
  },
);

// Internal events
export const internalEvents = InternalVimEvents.events;

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
