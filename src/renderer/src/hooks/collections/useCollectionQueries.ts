import { useQuery } from '@tanstack/react-query';
import { CollectionClient } from '../../api/CollectionClient';
import { collectionKeys } from '../../api/collectionKeys';

export const useCollectionDetail = (id: number) => {
  return useQuery({
    queryKey: collectionKeys.detail(id),
    queryFn: () => CollectionClient.getCollection(id),
    enabled: !!id,
  });
};

export const useCollectionChildren = (id: number | null) => {
  return useQuery({
    queryKey: collectionKeys.children(id),
    queryFn: () => CollectionClient.getChildren(id),
  });
};

export const useCollectionEntries = (id: number, offset: number = 0, limit: number = 100) => {
  return useQuery({
    queryKey: [...collectionKeys.entries(id), offset, limit],
    queryFn: () => CollectionClient.getEntries(id, offset, limit),
    enabled: !!id,
  });
};

export const useCollectionBreadcrumbs = (id: number) => {
  return useQuery({
    queryKey: collectionKeys.breadcrumbs(id),
    queryFn: () => CollectionClient.getBreadcrumbs(id),
    enabled: !!id,
  });
};
