import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { albums, albumsArtworks, albumsSongs, songs } from '../schema';

/**
 * Returns albums that do not have any artwork associated with them,
 * along with one sample song path to generate the artwork from.
 */
export const getAlbumsWithoutArtwork = async () => {
  // We need to find albums where there is NO entry in albumsArtworks
  // And we need at least ONE song path from that album to read ID3 tags.
  
  const result = await db
    .select({
      albumId: albums.id,
      sampleSongPath: sql<string>`MAX(${songs.path})`,
    })
    .from(albums)
    .leftJoin(albumsArtworks, eq(albums.id, albumsArtworks.albumId))
    .innerJoin(albumsSongs, eq(albums.id, albumsSongs.albumId))
    .innerJoin(songs, eq(albumsSongs.songId, songs.id))
    .where(isNull(albumsArtworks.artworkId))
    .groupBy(albums.id);

  return result;
};
