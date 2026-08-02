import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CollectionClient } from '../../api/CollectionClient';
import { collectionKeys } from '../../api/collectionKeys';
import type { CollectionEvent } from '../../api/CollectionTypes';

export const CollectionEventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
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
        case 'CollectionMoved':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.children(event.payload.newParentId) });
          break;
        case 'CollectionPinned':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
          if (event.payload.collectionId) {
            queryClient.invalidateQueries({ queryKey: collectionKeys.detail(event.payload.collectionId) });
          }
          break;
        case 'CollectionChanged':
        case 'SmartPlaylistUpdated':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
          if (event.payload.collectionId) {
            queryClient.invalidateQueries({ queryKey: collectionKeys.detail(event.payload.collectionId) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.entries(event.payload.collectionId) });
          }
          break;
        case 'CollectionDeleted':
          queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
          queryClient.invalidateQueries({ queryKey: collectionKeys.sidebar() });
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
