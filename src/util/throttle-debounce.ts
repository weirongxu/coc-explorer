import { onError } from '../logger';
import { clearTimeout } from 'timers';

export type Cancellable<F extends Function> = F & {
  cancel(): void;
};

export function throttle<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
  options: { tail?: boolean } = {},
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
  { tail = false }: { tail?: boolean } = {},
): Cancellable<(...args: A) => Promise<R | undefined>> {
  const debounceFn = debouncePromise(delay, fn);
  let lastTime = 0;
  const wrap = async (...args: A) => {
    const now = Date.now();
    if (now - lastTime < delay) {
      if (tail) {
        return await debounceFn(...args);
      } else {
        return undefined;
      }
    } else {
      lastTime = now;
      try {
        const ret = await fn(...args);
        return ret;
      } catch (error) {
        throw error;
      }
    }
  };
  wrap.cancel = debounceFn.cancel;
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
): Cancellable<(...args: A) => Promise<R | undefined>> {
  let timer: NodeJS.Timeout | null = null;
  let lastResolve: null | ((value: R | undefined) => void) = null;
  const wrap = async (...args: A) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      lastResolve!(undefined);
    }
    return await new Promise<R | undefined>((resolve, reject) => {
      lastResolve = resolve;
      timer = setTimeout(async () => {
        try {
          resolve(await fn(...args));
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
  wrap.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      lastResolve!(undefined);
    }
  };
  return wrap;
}
