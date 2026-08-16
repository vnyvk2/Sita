// @vitest-environment jsdom
import { render, cleanup, act } from '@testing-library/react';
import React, { createRef } from 'react';
import type { VirtuosoGridHandle } from 'react-virtuoso';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { scrollRegistry } from '../../utils/scrollStore';
import VirtualizedGrid from '../VirtualizedGrid';

// Mock react-virtuoso VirtuosoGrid to simulate rangeChanged, ref handle, and initialTopMostItemIndex behavior
let lastVirtuosoGridProps: Record<string, unknown> = {};
const mockScrollToIndex = vi.fn();

vi.mock('react-virtuoso', () => ({
  VirtuosoGrid: (props: Record<string, unknown>) => {
    lastVirtuosoGridProps = props;
    if (typeof props.ref === 'function') {
      props.ref({
        scrollToIndex: mockScrollToIndex,
        scrollTo: vi.fn(),
        scrollBy: vi.fn()
      });
    }
    return (
      <div
        data-testid="mock-virtuoso-grid"
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

describe('VirtualizedGrid - Restoration State Machine & Hardening', () => {
  beforeEach(() => {
    scrollRegistry.clearAll();
    lastVirtuosoGridProps = {};
    mockScrollToIndex.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('should seed initialTopMostItemIndex from scrollRegistry when saved position exists on mount', () => {
    scrollRegistry.set('test-albums', { index: 240, offset: 35 });

    const dummyData = Array.from({ length: 500 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedGrid
        scrollKey="test-albums"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Album {idx}</div>}
      />
    );

    expect(lastVirtuosoGridProps.initialTopMostItemIndex).toEqual({
      index: 240
    });
  });

  it('should ignore transient rangeChanged(0) and intermediate ranges during RESTORING state until target is reached', () => {
    scrollRegistry.set('test-albums', { index: 240, offset: 35 });

    const dummyData = Array.from({ length: 500 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedGrid
        scrollKey="test-albums"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Album {idx}</div>}
      />
    );

    const rangeChanged = lastVirtuosoGridProps.rangeChanged as (range: {
      startIndex: number;
      endIndex: number;
    }) => void;

    // Simulate initial layout transient event at startIndex 0
    rangeChanged({ startIndex: 0, endIndex: 12 });

    // Stored position MUST NOT be overwritten with 0!
    expect(scrollRegistry.get('test-albums')).toEqual({ index: 240, offset: 35 });

    // Simulate intermediate range before reaching target (e.g. 100..112)
    rangeChanged({ startIndex: 100, endIndex: 112 });
    expect(scrollRegistry.get('test-albums')).toEqual({ index: 240, offset: 35 });

    // Range reaches target restored position (240 is within 236..248)
    rangeChanged({ startIndex: 236, endIndex: 248 });

    // Transition to TRACKING: subsequent user scroll updates the registry
    rangeChanged({ startIndex: 260, endIndex: 272 });
    expect(scrollRegistry.getIndex('test-albums')).toBe(260);
  });

  it('should imperatively scroll VirtuosoGrid when scrollKey changes on an already-mounted grid', () => {
    scrollRegistry.set('genre-rock', { index: 150, offset: 12 });
    scrollRegistry.set('genre-pop', { index: 80, offset: 6 });

    const dummyData = Array.from({ length: 500 }, (_, i) => ({ id: i }));

    const { rerender } = render(
      <VirtualizedGrid
        scrollKey="genre-rock"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    // Initial mount used initialTopMostItemIndex
    expect(mockScrollToIndex).not.toHaveBeenCalled();

    // Rerender with different scrollKey (e.g. filter switched from Rock to Pop)
    rerender(
      <VirtualizedGrid
        scrollKey="genre-pop"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    // VirtuosoGrid MUST be imperatively instructed to scroll to genre-pop target with offset
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 80,
      offset: 6,
      align: 'start',
      behavior: 'auto'
    });
  });

  it('should imperatively scroll to 0 when switching to a dataset key with no stored position', () => {
    scrollRegistry.set('genre-rock', { index: 150, offset: 12 });

    const dummyData = Array.from({ length: 500 }, (_, i) => ({ id: i }));

    const { rerender } = render(
      <VirtualizedGrid
        scrollKey="genre-rock"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    rerender(
      <VirtualizedGrid
        scrollKey="genre-jazz-unseen"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
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
    const dummyData = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const mockElement = document.createElement('div');
    const addEventListenerSpy = vi.spyOn(mockElement, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(mockElement, 'removeEventListener');

    const { unmount } = render(
      <VirtualizedGrid
        scrollKey="listener-test-grid"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    act(() => {
      const scrollerRefFn = lastVirtuosoGridProps.scrollerRef as (el: HTMLElement) => void;
      scrollerRefFn(mockElement);
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true
    });

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('should forward external ref handle correctly', () => {
    const dummyData = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const gridRef = createRef<VirtuosoGridHandle>();

    render(
      <VirtualizedGrid
        ref={gridRef}
        scrollKey="ref-test"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    expect(gridRef.current).not.toBeNull();
    expect(gridRef.current?.scrollToIndex).toBeDefined();
  });

  it('should track immediately when no saved position exists', () => {
    const dummyData = Array.from({ length: 50 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedGrid
        scrollKey="new-grid"
        data={dummyData}
        fixedItemHeight={180}
        fixedItemWidth={180}
        itemContent={(idx) => <div>Item {idx}</div>}
      />
    );

    const rangeChanged = lastVirtuosoGridProps.rangeChanged as (range: {
      startIndex: number;
      endIndex: number;
    }) => void;

    rangeChanged({ startIndex: 12, endIndex: 24 });
    expect(scrollRegistry.getIndex('new-grid')).toBe(12);
  });
});
