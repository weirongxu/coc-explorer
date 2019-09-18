class Cancellation {}

export function throttleSingleThread<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
): (...args: A) => Promise<R | typeof Cancellation> {
  let lastTime = 0;
  let block = false;
  return async (...args: A) => {
    if (block) {
      return Cancellation;
    }
    const now = Date.now();
    if (now - lastTime < delay) {
      return Cancellation;
    }
    lastTime = now;
    try {
      block = true;
      const ret = await fn(...args);
      block = false;
      return ret;
    } catch (error) {
      block = false;
      throw error;
    }
  };
}

export function debounceSingleThread<A extends Array<any>, R>(
  delay: number,
  fn: (...args: A) => Promise<R> | R,
): (...args: A) => Promise<R | typeof Cancellation> {
  let timer: NodeJS.Timeout | null = null;
  let lastResolve: null | ((value: R | typeof Cancellation) => void) = null;
  let block = false;
  return async (...args: A) => {
    if (block) {
      return Cancellation;
    }

    if (timer) {
      clearTimeout(timer);
      lastResolve!(Cancellation);
    }
    return await new Promise<R | typeof Cancellation>((resolve, reject) => {
      lastResolve = resolve;
      timer = setTimeout(async () => {
        block = true;
        try {
          resolve(await fn(...args));
        } catch (error) {
          reject(error);
        }
        block = false;
      }, delay);
    });
  };
}
