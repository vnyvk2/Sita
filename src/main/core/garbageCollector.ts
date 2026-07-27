import { db } from '@main/db/db';
import {
  artworks,
  albumsArtworks,
  artistsArtworks,
  artworksGenres,
  artworksPlaylists,
  artworksSongs
} from '@main/db/schema';
import { removeArtworks } from '@main/other/artworks';
import { eq, isNull, and } from 'drizzle-orm';
import log from '@main/logger';

export async function collectGarbageArtworks(): Promise<number> {
  try {
    const orphanedRows = await db
      .select({ id: artworks.id })
      .from(artworks)
      .leftJoin(albumsArtworks, eq(artworks.id, albumsArtworks.artworkId))
      .leftJoin(artistsArtworks, eq(artworks.id, artistsArtworks.artworkId))
      .leftJoin(artworksGenres, eq(artworks.id, artworksGenres.artworkId))
      .leftJoin(artworksPlaylists, eq(artworks.id, artworksPlaylists.artworkId))
      .leftJoin(artworksSongs, eq(artworks.id, artworksSongs.artworkId))
      .where(
        and(
          isNull(albumsArtworks.artworkId),
          isNull(artistsArtworks.artworkId),
          isNull(artworksGenres.artworkId),
          isNull(artworksPlaylists.artworkId),
          isNull(artworksSongs.artworkId)
        )
      );

    if (orphanedRows.length === 0) {
      log.info('[GarbageCollector] No orphaned artworks found.');
      return 0;
    }

    const orphanedIds = orphanedRows.map((row) => row.id);
    log.info(`[GarbageCollector] Removing ${orphanedIds.length} orphaned artworks...`);
    
    // removeArtworks handles both deleting from the database and removing files from the filesystem
    await removeArtworks(orphanedIds);

    return orphanedIds.length;
  } catch (error) {
    log.error('[GarbageCollector] Failed to collect garbage artworks.', { error });
    throw error;
  }
}
