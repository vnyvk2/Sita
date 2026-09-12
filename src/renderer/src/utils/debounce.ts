/**
 * Debounce utility that returns a debounced closure.
 * Delays invoking the provided function until after `delay` milliseconds have elapsed
 * since the last time the debounced function was invoked.
 */
export const debounce = <T extends (...args: any[]) => void>(func: T, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      func(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
};

export default debounce;

