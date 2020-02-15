import { setImmediate } from 'timers';
import { onError } from '../logger';

export function asyncCatchError<R extends any, ARGS extends any[]>(
  fn: (...args: ARGS) => Promise<R>,
) {
  return async (...args: ARGS) => {
    try {
      return await fn(...args);
    } catch (e) {
      onError(e);
    }
  };
}

export function queueAsyncFunction<R extends any, ARGS extends any[]>(
  fn: (...args: ARGS) => Promise<R>,
): (...args: ARGS) => Promise<R> {
  type Task = {
    args: ARGS;
    fn: (...args: ARGS) => Promise<R>;
    resolve: (r: R) => void;
    reject: (error: Error) => void;
  };
  let queueStarted = false;
  const queueTasks: Task[] = [];
  return async (...args: ARGS): Promise<R> => {
    if (!queueStarted) {
      queueStarted = true;
      setImmediate(async () => {
        while (queueTasks.length) {
          const task = queueTasks.shift()!;
          try {
            const result = await task.fn(...task.args);
            task.resolve(result);
          } catch (error) {
            task.reject(error);
          }
        }
        queueStarted = false;
      });
    }
    return await new Promise<R>((resolve, reject) => {
      queueTasks.push({
        args,
        fn,
        resolve: (r: R) => {
          resolve(r);
        },
        reject,
      });
    });
  };
}
