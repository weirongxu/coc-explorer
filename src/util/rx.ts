import { HelperEventEmitter } from 'coc-helper';
import { Disposable } from 'coc.nvim';
import {
  debounceTime,
  Observable,
  Subject,
  Subscription,
  switchMap,
  ThrottleConfig,
  throttleTime,
} from 'rxjs';
import { logger } from '.';

export function subscriptionToDisposable(sub: Subscription): Disposable {
  return Disposable.create(() => sub.unsubscribe());
}

type SubDisposableHook<T> = T extends void
  ? (fn: () => void | Promise<void>) => Disposable
  : (fn: (arg: T) => void | Promise<void>) => Disposable;

export function subjectToHook<T>(
  observable: Observable<T>,
): SubDisposableHook<T> {
  return ((fn: (arg: T) => void | Promise<void>) => {
    const sub = observable.subscribe(logger.asyncCatch(fn));
    return Disposable.create(() => sub.unsubscribe());
  }) as SubDisposableHook<T>;
}

export type DisposableFn<F extends () => any> = F & {
  dispose(): void;
};

export function createSubject<T>(
  builder: (sub: Subject<T>) => Observable<any>,
): Subject<T> {
  const sub = new Subject<T>();
  const obs = builder(sub);
  obs.subscribe({
    error: logger.error,
  });
  return sub;
}

export function fromHelperEvent<E extends object, K extends keyof E>(
  events: HelperEventEmitter<E>,
  key: K,
) {
  type Value = E[K] extends (value: infer V) => any ? V : void;
  const sub = new Subject<Value>();
  events.once(key, ((v: Value) => {
    sub.next(v);
  }) as any as E[K]);
  return sub.asObservable();
}

export function debounceFn<A extends Array<any>>(
  dueTime: number,
  fn: (...args: A) => void | Promise<void>,
): DisposableFn<(...args: A) => void> {
  const sub = new Subject<A>();
  sub
    .pipe(
      debounceTime(dueTime),
      switchMap(async (args: A) => fn(...args)),
    )
    .subscribe({ error: logger.error });
  const wrappedFn = (...args: A) => sub.next(args);
  wrappedFn.dispose = () => sub.unsubscribe();
  return wrappedFn;
}

export function throttleFn<A extends Array<any>>(
  dueTime: number,
  fn: (...args: A) => void | Promise<void>,
  config?: ThrottleConfig,
): DisposableFn<(...args: A) => void> {
  const sub = new Subject<A>();
  sub
    .pipe(
      throttleTime(dueTime, undefined, config),
      switchMap(async (args: A) => fn(...args)),
    )
    .subscribe({
      error: logger.error,
    });
  const wrappedFn = (...args: A) => sub.next(args);
  wrappedFn.dispose = () => sub.unsubscribe();
  return wrappedFn;
}
