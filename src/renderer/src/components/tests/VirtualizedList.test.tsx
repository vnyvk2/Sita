// @vitest-environment jsdom
import { render, cleanup, act } from '@testing-library/react';
import type React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { scrollRegistry } from '../../utils/scrollStore';
import VirtualizedList from '../VirtualizedList';

// Mock react-virtuoso to simulate rangeChanged, ref handle, and initialTopMostItemIndex behavior
let lastVirtuosoProps: Record<string, unknown> = {};
const mockScrollToIndex = vi.fn();

vi.mock('react-virtuoso', () => ({
  Virtuoso: (props: Record<string, unknown>) => {
    lastVirtuosoProps = props;
    if (typeof props.ref === 'function') {
      props.ref({
        scrollToIndex: mockScrollToIndex,
        scrollTo: vi.fn(),
        scrollBy: vi.fn()
      });
    }
    return (
      <div
        data-testid="mock-virtuoso"
        ref={(el) => {
          if (typeof props.scrollerRef === 'function') {
            props.scrollerRef(el);
          }
        }}
      >
        {(props.data as unknown[])?.map((item, idx) => (
          <div key={idx}>
            {(props.itemContent as (i: number, item: unknown) => React.ReactNode)(idx, item)}
          </div>
        ))}
      </div>
    );
  }
}));

describe('VirtualizedList - Restoration State Machine & Hardening', () => {
  beforeEach(() => {
    scrollRegistry.clearAll();
    lastVirtuosoProps = {};
    mockScrollToIndex.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('should seed initialTopMostItemIndex from scrollRegistry when saved position exists on mount', () => {
    scrollRegistry.set('test-songs', { index: 500, offset: 20 });

    const dummyData = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedList
        scrollKey="test-songs"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    expect(lastVirtuosoProps.initialTopMostItemIndex).toEqual({
      index: 500,
      offset: 20
    });
  });

  it('should ignore transient rangeChanged(0) and intermediate ranges during RESTORING state until target is reached', () => {
    scrollRegistry.set('test-songs', { index: 500, offset: 20 });

    const dummyData = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedList
        scrollKey="test-songs"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    const rangeChanged = lastVirtuosoProps.rangeChanged as (range: {
      startIndex: number;
      endIndex: number;
    }) => void;

    // Simulate initial layout transient event at startIndex 0
    rangeChanged({ startIndex: 0, endIndex: 20 });

    // Stored position MUST NOT be overwritten with 0!
    expect(scrollRegistry.get('test-songs')).toEqual({ index: 500, offset: 20 });

    // Simulate intermediate range before reaching target (e.g. 200..220)
    rangeChanged({ startIndex: 200, endIndex: 220 });
    expect(scrollRegistry.get('test-songs')).toEqual({ index: 500, offset: 20 });

    // Range changes to target restored position (500 is within 490..510)
    rangeChanged({ startIndex: 490, endIndex: 510 });

    // Transition to TRACKING: subsequent user scroll to 530 updates the registry
    rangeChanged({ startIndex: 530, endIndex: 555 });
    expect(scrollRegistry.getIndex('test-songs')).toBe(530);
  });

  it('should imperatively scroll Virtuoso when scrollKey changes on an already-mounted list', () => {
    scrollRegistry.set('dataset-a', { index: 300, offset: 15 });
    scrollRegistry.set('dataset-b', { index: 120, offset: 8 });

    const dummyData = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

    const { rerender } = render(
      <VirtualizedList
        scrollKey="dataset-a"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    // Initial mount used initialTopMostItemIndex
    expect(mockScrollToIndex).not.toHaveBeenCalled();

    // Rerender with different scrollKey (e.g. genre filter switched from Rock to Pop)
    rerender(
      <VirtualizedList
        scrollKey="dataset-b"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    // Virtuoso MUST be imperatively instructed to scroll to dataset-b's target (120) with offset (8)
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 120,
      offset: 8,
      align: 'start',
      behavior: 'auto'
    });
  });

  it('should imperatively scroll to 0 when switching to a dataset key with no stored position', () => {
    scrollRegistry.set('dataset-a', { index: 300, offset: 15 });

    const dummyData = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

    const { rerender } = render(
      <VirtualizedList
        scrollKey="dataset-a"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    rerender(
      <VirtualizedList
        scrollKey="dataset-c-unseen"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 0,
      align: 'start',
      behavior: 'auto'
    });
  });

  it('should cleanly attach and detach scroll listener on scroller element without leaking', () => {
    const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const mockElement = document.createElement('div');
    const addEventListenerSpy = vi.spyOn(mockElement, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(mockElement, 'removeEventListener');

    const { unmount } = render(
      <VirtualizedList
        scrollKey="listener-test"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    // Explicitly invoke scrollerRef with our mock element inside act
    act(() => {
      const scrollerRefFn = lastVirtuosoProps.scrollerRef as (el: HTMLElement) => void;
      scrollerRefFn(mockElement);
    });

    // After state update and effect run, exactly 1 listener attached
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.objectContaining({ passive: true })
    );

    // On unmount, listener is removed cleanly
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('should track immediately when no saved position exists', () => {
    const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedList
        scrollKey="new-list"
        data={dummyData}
        fixedItemHeight={60}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    const rangeChanged = lastVirtuosoProps.rangeChanged as (range: {
      startIndex: number;
      endIndex: number;
    }) => void;

    // Normal tracking from start
    rangeChanged({ startIndex: 15, endIndex: 35 });
    expect(scrollRegistry.getIndex('new-list')).toBe(15);
  });

  describe('Fast-Scroll .is-scrolling Lifecycle & ScrollSeek (v3)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add .is-scrolling class and notify onScrollingStateChange on scroll', () => {
      const onScrollingStateChange = vi.fn();
      const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      const { getByTestId } = render(
        <VirtualizedList
          data={dummyData}
          fixedItemHeight={60}
          itemContent={(idx) => <div>Item {idx}</div>}
          onScrollingStateChange={onScrollingStateChange}
        />
      );

      const scroller = getByTestId('mock-virtuoso');
      expect(scroller.classList.contains('is-scrolling')).toBe(false);

      act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });

      expect(scroller.classList.contains('is-scrolling')).toBe(true);
      expect(onScrollingStateChange).toHaveBeenCalledWith(true);
    });

    it('should maintain .is-scrolling for at least MIN_HOLD_MS (400ms) on a single scroll event', () => {
      const onScrollingStateChange = vi.fn();
      const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      const { getByTestId } = render(
        <VirtualizedList
          data={dummyData}
          fixedItemHeight={60}
          itemContent={(idx) => <div>Item {idx}</div>}
          onScrollingStateChange={onScrollingStateChange}
        />
      );

      const scroller = getByTestId('mock-virtuoso');

      act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });

      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      // Advance by SCROLL_IDLE_MS (150ms) -> Still within MIN_HOLD_MS (400ms), class must remain!
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      // Advance to 350ms total -> still held
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      // Advance past 400ms total -> class removed and onScrollingStateChange(false) called
      act(() => {
        vi.advanceTimersByTime(51);
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(false);
      expect(onScrollingStateChange).toHaveBeenLastCalledWith(false);
    });

    it('should reset idle timer on successive scroll ticks and remove class correctly', () => {
      const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      const { getByTestId } = render(
        <VirtualizedList
          data={dummyData}
          fixedItemHeight={60}
          itemContent={(idx) => <div>Item {idx}</div>}
        />
      );

      const scroller = getByTestId('mock-virtuoso');

      // t = 0
      act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      // t = 350ms (second scroll event)
      act(() => {
        vi.advanceTimersByTime(350);
        scroller.dispatchEvent(new Event('scroll'));
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      // t = 450ms (100ms after second event: idle timer of 150ms not elapsed yet)
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      // t = 501ms (151ms after second event, and 501ms > 400ms MIN_HOLD): class removed
      act(() => {
        vi.advanceTimersByTime(51);
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(false);
    });

    it('should cleanly remove .is-scrolling and cancel timers when unmounting during active scroll', () => {
      const onScrollingStateChange = vi.fn();
      const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      const { getByTestId, unmount } = render(
        <VirtualizedList
          data={dummyData}
          fixedItemHeight={60}
          itemContent={(idx) => <div>Item {idx}</div>}
          onScrollingStateChange={onScrollingStateChange}
        />
      );

      const scroller = getByTestId('mock-virtuoso');

      act(() => {
        scroller.dispatchEvent(new Event('scroll'));
      });
      expect(scroller.classList.contains('is-scrolling')).toBe(true);

      unmount();
      expect(scroller.classList.contains('is-scrolling')).toBe(false);
      expect(onScrollingStateChange).toHaveBeenLastCalledWith(false);
    });

    it('should not forward scrollSeekConfiguration by default, but forward when explicitly provided', () => {
      const dummyData = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      // Default: scrollSeekConfiguration is false/undefined to prevent double-swap flashes
      const { unmount } = render(
        <VirtualizedList
          data={dummyData}
          fixedItemHeight={60}
          itemContent={(idx) => <div>Item {idx}</div>}
        />
      );

      expect(lastVirtuosoProps.scrollSeekConfiguration).toBeUndefined();
      unmount();

      // Opt-in: explicitly provided
      render(
        <VirtualizedList
          data={dummyData}
          fixedItemHeight={60}
          scrollSeekConfiguration={{
            enter: (v) => Math.abs(v) > 800,
            exit: (v) => Math.abs(v) < 300
          }}
          itemContent={(idx) => <div>Item {idx}</div>}
        />
      );

      expect(lastVirtuosoProps.scrollSeekConfiguration).toBeDefined();
      const config = lastVirtuosoProps.scrollSeekConfiguration as {
        enter: (v: number) => boolean;
        exit: (v: number) => boolean;
      };
      expect(config.enter(900)).toBe(true);
      expect(config.enter(500)).toBe(false);
      expect(config.exit(200)).toBe(true);
      expect(config.exit(400)).toBe(false);

      const components = lastVirtuosoProps.components as {
        ScrollSeekPlaceholder?: React.ComponentType<{ height: number; index: number }>;
      };
      expect(components.ScrollSeekPlaceholder).toBeDefined();
    });
  });
});
