import { createQueryKeys } from '@lukemorales/query-key-factory';

export const songPlaylistsQuery = createQueryKeys('songPlaylists', {
  membership: (songId: number) => ({
    queryKey: [songId],
    queryFn: async (): Promise<number[]> => {
      try {
        const collections = await window.api.membership.getCollectionsContaining(
          { kind: 'song', id: songId },
          'playlist'
        );
        return Array.isArray(collections) ? collections.map((c) => Number(c.id)) : [];
      } catch (err) {
        console.error(err);
        return [];
      }
    }
  })
});
