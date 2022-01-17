import { logger } from '.';

export function queueAsyncFunction<R, ARGS extends any[]>(
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
      setImmediate(
        logger.asyncCatch(async () => {
          while (queueTasks.length) {
            const task = queueTasks.shift()!;
            try {
              const result = await task.fn(...task.args);
              task.resolve(result);
            } catch (error) {
              task.reject(error as Error);
            }
          }
          queueStarted = false;
        }),
      );
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
