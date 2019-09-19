export const unsigned = (num: number) => (typeof num !== 'number' ? 0 : num < 0 ? 0 : Math.floor(num));
