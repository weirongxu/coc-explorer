import { Disposable } from 'coc.nvim';
import {
  debounceTime,
  Observable,
  Subject,
  Subscription,
  ThrottleConfig,
  throttleTime,
} from 'rxjs';

export function subToDisposable(sub: Subscription): Disposable {
  return Disposable.create(() => sub.unsubscribe());
}

type SubDisposableHook<T> = T extends void
  ? (fn: () => void) => Disposable
  : (fn: (arg: T) => void) => Disposable;

export function subToHook<T>(observable: Observable<T>): SubDisposableHook<T> {
  return ((fn: (arg: T) => void) => {
    const sub = observable.subscribe(fn);
    return Disposable.create(() => sub.unsubscribe());
  }) as SubDisposableHook<T>;
}

export type DisposableFn<F extends Function> = F & {
  dispose(): void;
};

export function createSub<T>(builder: (sub: Subject<T>) => void): Subject<T> {
  const sub = new Subject<T>();
  builder(sub);
  return sub;
}

export function debounceFn<A extends Array<any>>(
  dueTime: number,
  fn: (...args: A) => void,
): DisposableFn<(...args: A) => void> {
  const sub = new Subject<A>();
  sub.pipe(debounceTime(dueTime)).subscribe((args: A) => fn(...args));
  const wrappedFn = (...args: A) => sub.next(args);
  wrappedFn.dispose = () => sub.unsubscribe();
  return wrappedFn;
}

export function throttleFn<A extends Array<any>>(
  dueTime: number,
  fn: (...args: A) => void,
  config?: ThrottleConfig,
): DisposableFn<(...args: A) => void> {
  const sub = new Subject<A>();
  sub
    .pipe(throttleTime(dueTime, undefined, config))
    .subscribe((args: A) => fn(...args));
  const wrappedFn = (...args: A) => sub.next(args);
  wrappedFn.dispose = () => sub.unsubscribe();
  return wrappedFn;
}
