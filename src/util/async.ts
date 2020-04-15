export const delay = (time: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

export const nextTick = () => {
  return new Promise((resolve) => {
    process.nextTick(resolve);
  });
};
