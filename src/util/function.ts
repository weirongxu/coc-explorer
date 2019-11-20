import { setImmediate } from 'timers';

export function queueAsyncFunction<R extends any, ARGS extends any[]>(
  fn: (...args: ARGS) => Promise<R>,
): (...args: ARGS) => Promise<R> {
  type Task = {
    args: ARGS;
    fn: (...args: ARGS) => Promise<R>;
    callback: (r: R) => void;
  };
  let queueStarted = false;
  const queueTasks: Task[] = [];
  return async (...args: ARGS): Promise<R> => {
    if (!queueStarted) {
      queueStarted = true;
      setImmediate(async () => {
        while (queueTasks.length) {
          const task = queueTasks.shift()!;
          task.callback(await task.fn(...task.args));
        }
        queueStarted = false;
      });
    }
    return await new Promise<R>((resolve) => {
      queueTasks.push({
        args,
        fn,
        callback: (r: R) => {
          resolve(r);
        },
      });
    });
  };
}
