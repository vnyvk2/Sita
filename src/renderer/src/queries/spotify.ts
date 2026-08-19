import { createQueryKeys } from '@lukemorales/query-key-factory';

export const spotifyQuery = createQueryKeys('spotify', {
  status: {
    queryKey: null,
    queryFn: async () => window.api.spotify.getStatus()
  },
  playlists: {
    queryKey: null,
    queryFn: async () => window.api.spotify.getPlaylists({ limit: 50, offset: 0 })
  }
});
