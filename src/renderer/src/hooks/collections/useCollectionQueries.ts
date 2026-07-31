import { useQuery, queryOptions } from '@tanstack/react-query';
import { CollectionClient } from '../../api/CollectionClient';
import { collectionKeys } from '../../api/collectionKeys';

export const collectionDetailOptions = (id: number) => {
  return queryOptions({
    queryKey: collectionKeys.detail(id),
    queryFn: () => CollectionClient.getCollection(id),
  });
};

export const useCollectionDetail = (id: number) => {
  return useQuery({ ...collectionDetailOptions(id), enabled: !!id });
};

export const collectionChildrenOptions = (id: number | null) => {
  return queryOptions({
    queryKey: collectionKeys.children(id),
    queryFn: () => CollectionClient.getChildren(id),
  });
};

export const useCollectionChildren = (id: number | null) => {
  return useQuery(collectionChildrenOptions(id));
};

export const rootCollectionsOptions = (sortType?: PlaylistSortTypes) => {
  return queryOptions({
    queryKey: [...collectionKeys.children(null), sortType],
    queryFn: () => CollectionClient.getChildren(null),
    select: (data: any) => {
      if (!data) return [];
      return [...data].sort((a, b) => {
        if (!!a.isPinned !== !!b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        switch (sortType) {
          case 'aToZ':
            return a.name.localeCompare(b.name);
          case 'zToA':
            return b.name.localeCompare(a.name);
          case 'noOfSongsAscending':
            return a.itemCount - b.itemCount;
          case 'noOfSongsDescending':
            return b.itemCount - a.itemCount;
          default:
            return 0;
        }
      });
    },
  });
};

export const useRootCollections = (sortType?: PlaylistSortTypes) => {
  return useQuery(rootCollectionsOptions(sortType));
};

export const useCollectionArtworks = (songIds: number[]) => {
  const stringIds = songIds.map(String);
  return useQuery({
    queryKey: ['collectionArtworks', `songIds=${stringIds.join(',')}`],
    queryFn: () => CollectionClient.getArtworks(songIds),
    enabled: songIds.length > 0,
  });
};

export const collectionEntriesOptions = (id: number, offset?: number, limit?: number) => {
  return queryOptions({
    queryKey: [...collectionKeys.entries(id), offset, limit],
    queryFn: () => CollectionClient.getEntries(id, offset, limit)
  });
};

export const useCollectionEntries = (id: number, offset: number = 0, limit: number = 100) => {
  return useQuery({ ...collectionEntriesOptions(id, offset, limit), enabled: !!id });
};

export const collectionBreadcrumbsOptions = (id: number) => {
  return queryOptions({
    queryKey: collectionKeys.breadcrumbs(id),
    queryFn: () => CollectionClient.getBreadcrumbs(id),
  });
};

export const useCollectionBreadcrumbs = (id: number) => {
  return useQuery({ ...collectionBreadcrumbsOptions(id), enabled: !!id });
};
