import type { CollectionEvent } from '@common/collections/operationInputs';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect } from 'react';

import { CollectionClient } from '../../api/CollectionClient';
import { collectionKeys } from '../../api/collectionKeys';

/**
 * Maps backend CollectionEvents to query-cache invalidation.
 *
 * Scoping notes: - `reorder` only changes entry order: entries + detail are enough. Tree and
 * sidebar metadata (names, counts, pins) are untouched, so refetching them on every drag would be
 * wasted work. - UndoEngine does not emit events yet; surfaces that undo/redo must invalidate their
 * own queries.
 */
export const CollectionEventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleEvent = (_e: unknown, event: CollectionEvent) => {
      if (window.api?.properties?.isInDevelopment) {
        console.log('[CollectionEventProvider] Received event:', event);
      }

      switch (event.type) {
        case 'CollectionCreated':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({
            queryKey: collectionKeys.children(event.payload.parentId)
          });
          break;
        case 'CollectionMoved':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({
            queryKey: collectionKeys.children(event.payload.newParentId)
          });
          break;
        case 'CollectionPinned':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          if (event.payload.collectionId) {
            queryClient.invalidateQueries({
              queryKey: collectionKeys.detail(event.payload.collectionId)
            });
          }
          break;
        case 'CollectionChanged': {
          const { collectionId, action } = event.payload;

          if (action === 'reorder') {
            // Order-only change - skip tree/sidebar refetches entirely
            if (collectionId) {
              queryClient.invalidateQueries({ queryKey: collectionKeys.detail(collectionId) });
              queryClient.invalidateQueries({ queryKey: collectionKeys.entries(collectionId) });
            }
            break;
          }

          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          if (collectionId) {
            queryClient.invalidateQueries({ queryKey: collectionKeys.detail(collectionId) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.entries(collectionId) });
          }
          break;
        }
        case 'CollectionDeleted':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          for (const id of event.payload.collectionIds ?? []) {
            queryClient.removeQueries({ queryKey: collectionKeys.detail(id) });
            queryClient.removeQueries({ queryKey: collectionKeys.entries(id) });
          }
          break;
        default:
          queryClient.invalidateQueries({ queryKey: collectionKeys.all });
      }
    };

    CollectionClient.onEvent(handleEvent);

    return () => {
      CollectionClient.offEvent(handleEvent);
    };
  }, [queryClient]);

  return <>{children}</>;
};
