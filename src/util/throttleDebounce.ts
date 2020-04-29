import { onError } from '../logger';

export class Cancelled {}
const cancelled = new Cancelled();

export type Cancellable<F extends Function> = F & {
  cancel(): void;
};

export type ThrottleOptions = {
  leading?: boolean;
  trailing?: boolean;
};

export function throttle<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
  options: ThrottleOptions = {},
): Cancellable<(...args: A) => void> {
  const throttleFn = throttlePromise(delay, fn, options);
  const wrap = (...args: A) => {
    throttleFn(...args).catch(onError);
  };
  wrap.cancel = throttleFn.cancel;
  return wrap;
}

export function throttlePromise<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
  { leading = true, trailing = false }: ThrottleOptions = {},
): Cancellable<(...args: A) => Promise<R | Cancelled>> {
  let blockTimer: NodeJS.Timeout | null = null;
  let trailStore: {
    cancel: () => void;
    invoke: () => void;
  } | null = null;

  const wrap = async (...args: A) => {
    const toTrailStore = () =>
      new Promise<R | Cancelled>((resolve, reject) => {
        trailStore = {
          cancel() {
            resolve(cancelled);
            trailStore = null;
          },
          async invoke() {
            try {
              resolve(await fn(...args));
            } catch (err) {
              reject(err);
            } finally {
              trailStore = null;
            }
          },
        };
      });
    if (blockTimer === null) {
      blockTimer = setTimeout(() => {
        trailStore?.invoke();
        blockTimer = null;
      }, delay);
      if (leading) {
        return fn(...args);
      } else {
        return toTrailStore();
      }
    } else if (trailing) {
      trailStore?.cancel();
      return toTrailStore();
    }
    return cancelled;
  };
  wrap.cancel = () => {
    trailStore?.cancel();
  };
  return wrap;
}

export function debounce<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
): Cancellable<(...args: A) => void> {
  const debounceFn = debouncePromise(delay, fn);
  const wrap = (...args: A) => {
    debounceFn(...args).catch(onError);
  };
  wrap.cancel = debounceFn.cancel;
  return wrap;
}

export function debouncePromise<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
): Cancellable<(...args: A) => Promise<R | Cancelled>> {
  let timer: NodeJS.Timeout | null = null;
  let store: {
    cancel: () => void;
    invoke: () => void;
  } | null = null;
  const wrap = async (...args: A) => {
    store?.cancel();
    timer = setTimeout(async () => {
      store?.invoke();
    }, delay);
    return await new Promise<R | Cancelled>((resolve, reject) => {
      store = {
        cancel() {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          resolve(cancelled);
          store = null;
        },
        async invoke() {
          try {
            resolve(await fn(...args));
          } catch (err) {
            reject(err);
          } finally {
            timer = null;
            store = null;
          }
        },
      };
    });
  };
  wrap.cancel = () => {
    store?.cancel();
  };
  return wrap;
}
