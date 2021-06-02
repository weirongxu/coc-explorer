export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const nextTick = () => {
  return new Promise((resolve) => {
    process.nextTick(resolve);
  });
};

export const timeoutPromise = () => {};
