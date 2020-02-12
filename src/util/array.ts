export const max = (arr: number[]) => {
  let len = arr.length - 1;
  let max = -Infinity;

  while (len >= 0) {
    if (arr[len] > max) {
      max = arr[len];
    }
    len -= 1;
  }

  return max;
};

export const min = (arr: number[]) => {
  let len = arr.length;
  let min = Infinity;

  while (len >= 0) {
    if (arr[len] < min) {
      min = arr[len];
    }
    len -= 1;
  }

  return min;
};
