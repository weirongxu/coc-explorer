import { throttlePromise, debouncePromise } from './throttleDebounce';
import { delay } from './async';

describe('throttlePromise', () => {
  test('leading & trailing', async () => {
    let sentCount = 0;
    const fn = throttlePromise(
      100,
      () => {
        sentCount += 1;
      },
      { leading: true, trailing: true },
    );
    void fn();
    expect(sentCount).toEqual(1);
    void fn();
    void fn();
    void fn();
    void fn();
    expect(sentCount).toEqual(1);
    await delay(105);
    expect(sentCount).toEqual(2);
  });

  test('leading', async () => {
    let sentCount = 0;
    const fn = throttlePromise(
      100,
      () => {
        sentCount += 1;
      },
      { leading: true, trailing: false },
    );
    void fn();
    void fn();
    void fn();
    void fn();
    void fn();
    expect(sentCount).toEqual(1);
    await delay(105);
    expect(sentCount).toEqual(1);
    void fn();
    expect(sentCount).toEqual(2);
    await delay(105);
    expect(sentCount).toEqual(2);
  });

  test('trailing', async () => {
    let sentCount = 0;
    const fn = throttlePromise(
      100,
      () => {
        sentCount += 1;
      },
      { leading: false, trailing: true },
    );
    void fn();
    void fn();
    void fn();
    void fn();
    void fn();
    expect(sentCount).toEqual(0);
    await delay(105);
    expect(sentCount).toEqual(1);
    void fn();
    expect(sentCount).toEqual(1);
    await delay(105);
    expect(sentCount).toEqual(2);
  });
});

describe('debounce', () => {
  test('debouncePromise', async () => {
    const mockFn = jest.fn();
    const fn = debouncePromise(500, mockFn);
    const mockFn2 = jest.fn();
    debouncePromise(200, mockFn2);
    debouncePromise(200, mockFn2);
    debouncePromise(200, mockFn2);
    debouncePromise(200, mockFn2);
    void fn();
    void fn();
    void fn();
    void fn();
    void fn();
    await delay(50);
    void fn();
    await delay(50);
    expect(mockFn).toHaveBeenCalledTimes(0);
    await delay(480);
    expect(mockFn).toHaveBeenCalledTimes(1);

    void fn();
    await delay(100);
    expect(mockFn).toHaveBeenCalledTimes(1);
    void fn();
    await delay(100);
    expect(mockFn).toHaveBeenCalledTimes(1);
    await delay(430);
    expect(mockFn).toHaveBeenCalledTimes(2);

    await delay(1000);
    expect(mockFn).toHaveBeenCalledTimes(2);

    void fn();
    await delay(510);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});
