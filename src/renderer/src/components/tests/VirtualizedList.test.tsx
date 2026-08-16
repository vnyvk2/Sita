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

    // Virtuoso MUST be imperatively instructed to scroll to dataset-b's target (120)
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 120,
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
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true
    });

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
});
