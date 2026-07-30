import { getSongArtworksBySongIds } from '@main/db/queries/songs';

import { parseSongArtworks } from '../../fs/resolveFilePaths';

export class CollectionArtworkRepository {
  public static async getArtworks(songIds: number[]) {
    const artworkData = await getSongArtworksBySongIds(songIds);

    const artworks = artworkData.map((artwork) => {
      const artworkList = artwork.artworks?.map((a) => a.artwork).filter(Boolean) ?? [];
      const artworkPaths = parseSongArtworks(artworkList as any);

      return {
        songId: artwork.id,
        artworkPaths
      };
    });

    return artworks;
  }
}
