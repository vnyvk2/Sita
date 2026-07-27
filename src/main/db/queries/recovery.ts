import { eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { albums, albumsArtworks, albumsSongs, songs } from '../schema';

/**
 * Returns albums that do not have any artwork associated with them,
 * along with one sample song path to generate the artwork from.
 */
export const getAlbumsWithoutArtwork = async () => {
  // We need to find albums where there is NO entry in albumsArtworks
  // And we need at least ONE song path from that album to read ID3 tags.
  
  // 1. Get albums left joined with albumsArtworks where artworkId is null
  const albumsWithNoArtwork = await db
    .select({
      albumId: albums.id,
      title: albums.title,
    })
    .from(albums)
    .leftJoin(albumsArtworks, eq(albums.id, albumsArtworks.albumId))
    .where(isNull(albumsArtworks.artworkId));

  // 2. For each of these albums, we need a sample song.
  const albumsToRecover: { albumId: number; sampleSongPath: string }[] = [];

  // Remove duplicates just in case leftJoin returned multiples (though it shouldn't if there are NO artworks)
  const uniqueAlbumIds = [...new Set(albumsWithNoArtwork.map(a => a.albumId))];

  for (const albumId of uniqueAlbumIds) {
    const sampleSong = await db
      .select({ path: songs.path })
      .from(albumsSongs)
      .innerJoin(songs, eq(albumsSongs.songId, songs.id))
      .where(eq(albumsSongs.albumId, albumId))
      .limit(1);

    if (sampleSong && sampleSong.length > 0) {
      albumsToRecover.push({
        albumId: albumId,
        sampleSongPath: sampleSong[0].path,
      });
    }
  }

  return albumsToRecover;
};
