export const collectionKeys = {
  all: ['collections'] as const,
  tree: () => [...collectionKeys.all, 'tree'] as const,
  detail: (id: number) => [...collectionKeys.all, 'detail', id] as const,
  children: (id: number | null) => [...collectionKeys.all, 'children', id] as const,
  entries: (id: number) => [...collectionKeys.all, 'entries', id] as const,
  sidebar: () => [...collectionKeys.all, 'sidebar'] as const,
  search: (query: string) => [...collectionKeys.all, 'search', query] as const,
  breadcrumbs: (id: number) => [...collectionKeys.all, 'breadcrumbs', id] as const,
};
