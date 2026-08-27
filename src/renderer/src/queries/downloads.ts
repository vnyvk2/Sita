import { queryOptions } from '@tanstack/react-query';

export const downloadsQuery = {
  state: () =>
    queryOptions({
      queryKey: ['downloads', 'state'] as const,
      queryFn: () => window.api.downloads.getState()
    })
};

export const downloadsMutationKeys = {
  search: ['downloads', 'search'] as const,
  resolvePlaylist: ['downloads', 'resolvePlaylist'] as const,
  enqueue: ['downloads', 'enqueue'] as const,
  enqueueMany: ['downloads', 'enqueueMany'] as const,
  cancel: ['downloads', 'cancel'] as const
};
