// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { scrollRegistry } from '../../utils/scrollStore';
import VirtualizedList from '../VirtualizedList';

// Mock react-virtuoso to simulate rangeChanged and initialTopMostItemIndex behavior
let lastVirtuosoProps: Record<string, unknown> = {};
vi.mock('react-virtuoso', () => ({
  Virtuoso: (props: Record<string, unknown>) => {
    lastVirtuosoProps = props;
    return (
      <div data-testid="mock-virtuoso">
        {(props.data as unknown[])?.map((item, idx) => (
          <div key={idx}>
            {(props.itemContent as (i: number, item: unknown) => React.ReactNode)(
              idx,
              item
            )}
          </div>
        ))}
      </div>
    );
  }
}));

describe('VirtualizedList - Restoration State Machine', () => {
  beforeEach(() => {
    scrollRegistry.clearAll();
    lastVirtuosoProps = {};
  });

  it('should seed initialTopMostItemIndex from scrollRegistry when saved position exists', () => {
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

  it('should ignore transient rangeChanged(0) events during RESTORING state and preserve stored position', () => {
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

    // Range changes to target restored position
    rangeChanged({ startIndex: 500, endIndex: 525 });

    // Transition to TRACKING: subsequent user scroll to 530 updates the registry
    rangeChanged({ startIndex: 530, endIndex: 555 });
    expect(scrollRegistry.getIndex('test-songs')).toBe(530);
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
