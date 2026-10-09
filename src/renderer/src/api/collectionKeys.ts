import type { PlaylistCatalogOptions } from '@common/collections/dtos';

export const collectionKeys = {
  all: ['collections'] as const,
  tree: () => [...collectionKeys.all, 'tree'] as const,
  detail: (id: number) => [...collectionKeys.all, 'detail', id] as const,
  children: (id: number | null) => [...collectionKeys.all, 'children', id] as const,
  entries: (id: number) => [...collectionKeys.all, 'entries', id] as const,
  catalog: (id: number, options?: PlaylistCatalogOptions) =>
    [...collectionKeys.all, 'catalog', id, options] as const,
  catalogRoot: (id: number) => [...collectionKeys.all, 'catalog', id] as const,
  search: (query: string) => [...collectionKeys.all, 'search', query] as const,
  breadcrumbs: (id: number) => [...collectionKeys.all, 'breadcrumbs', id] as const
};

