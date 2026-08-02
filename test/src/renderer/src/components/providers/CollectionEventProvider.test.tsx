// @vitest-environment jsdom
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionEventProvider } from '@renderer/components/providers/CollectionEventProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { collectionKeys } from '@renderer/api/collectionKeys';
import type { CollectionEvent } from '@renderer/api/CollectionTypes';

// We need to capture the registered callback to trigger it
let registeredCallback: ((e: unknown, event: CollectionEvent) => void) | null = null;

vi.mock('@renderer/api/CollectionClient', () => ({
  CollectionClient: {
    onEvent: vi.fn((callback) => {
      registeredCallback = callback;
    }),
    offEvent: vi.fn((callback) => {
      expect(callback).toBe(registeredCallback);
      registeredCallback = null;
    })
  }
}));

describe('CollectionEventProvider', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    registeredCallback = null;
    vi.clearAllMocks();
  });

  it('should invalidate queries on CollectionCreated', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <CollectionEventProvider>
          <div>Child</div>
        </CollectionEventProvider>
      </QueryClientProvider>
    );

    // Verify the mock intercepted the event registration
    expect(registeredCallback).not.toBeNull();

    // Trigger an event through the captured callback
    act(() => {
      registeredCallback!(null, {
        type: 'CollectionCreated',
        payload: {
          collectionId: 'new-id',
          parentId: 'parent-id',
          dto: {} as any
        }
      });
    });

    // Verify that the tree query and the specific children query were invalidated
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: collectionKeys.tree() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: collectionKeys.children('parent-id') });
  });

  it('should invalidate queries on CollectionDeleted', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <CollectionEventProvider>
          <div>Child</div>
        </CollectionEventProvider>
      </QueryClientProvider>
    );

    act(() => {
      registeredCallback!(null, {
        type: 'CollectionDeleted',
        payload: {
          collectionId: 'deleted-id',
          deletedCount: 1
        }
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: collectionKeys.tree() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: collectionKeys.sidebar() });
  });

  it('should invalidate queries on CollectionMoved', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <CollectionEventProvider>
          <div>Child</div>
        </CollectionEventProvider>
      </QueryClientProvider>
    );

    act(() => {
      registeredCallback!(null, {
        type: 'CollectionMoved',
        payload: {
          collectionId: 'moved-id',
          newParentId: 'new-parent-id'
        }
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: collectionKeys.tree() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: collectionKeys.children('new-parent-id') });
  });
});
