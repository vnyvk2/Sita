import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CollectionClient } from '../api/CollectionClient';
import { collectionKeys } from '../api/collectionKeys';
import type { CollectionEvent } from '../api/CollectionTypes';

export const CollectionEventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    const handleEvent = (_e: unknown, event: CollectionEvent) => {
      // Use Nora's window.api.properties.isInDevelopment if available, else standard fallback
      if (window.api?.properties?.isInDevelopment) {
        console.log('[CollectionEventProvider] Received event:', event);
      }

      switch (event.type) {
        case 'CollectionCreated':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.children(event.payload.parentId) });
          break;
        case 'CollectionRenamed':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.detail(event.payload.collectionId) });
          break;
        case 'CollectionMoved':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.children(event.payload.newParentId) });
          // Note: Would also need to invalidate old parent, but tree invalidation might cover enough for now
          break;
        case 'CollectionPinned':
        case 'CollectionUnpinned':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
          break;
        case 'CollectionChanged':
        case 'SmartPlaylistUpdated':
          queryClient.invalidateQueries({ queryKey: collectionKeys.detail(event.payload.collectionId) });
          queryClient.invalidateQueries({ queryKey: collectionKeys.entries(event.payload.collectionId) });
          break;
        case 'CollectionDeleted':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
          break;
        case 'UndoExecuted':
        case 'RedoExecuted':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
          break;
        default:
          if (window.api?.properties?.isInDevelopment) {
            console.warn(`[CollectionEventProvider] Unhandled event type: ${(event as any).type}`);
          }
      }
    };

    CollectionClient.onEvent(handleEvent);

    return () => {
      CollectionClient.offEvent(handleEvent);
      mounted.current = false;
    };
  }, [queryClient]);

  return <>{children}</>;
};
