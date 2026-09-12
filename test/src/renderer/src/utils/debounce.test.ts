import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import debounce from '../../../../../src/renderer/src/utils/debounce';

describe('debounce utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delays execution until specified time has elapsed', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid calls into a single invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('cancels pending execution when cancel() is called', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();

    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('maintains independent timers across multiple debounced instances', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const debounced1 = debounce(fn1, 100);
    const debounced2 = debounce(fn2, 200);

    debounced1();
    debounced2();

    vi.advanceTimersByTime(100);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
