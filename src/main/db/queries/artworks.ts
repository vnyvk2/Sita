import { and, eq, inArray, sql } from 'drizzle-orm';

export const CURRENT_ARTWORK_GENERATOR_VERSION = 1;

import { db } from '../db';
import {
  albumsArtworks,
  artistsArtworks,
  artworks,
  artworksGenres,
  artworkSourceEnum,
  artworksPlaylists,
  artworksSongs
} from '../schema';

export const saveArtworks = async (
  data: {
    hash: string;
    path: string;
    width: number;
    height: number;
    source: (typeof artworkSourceEnum.enumValues)[number];
  }[],
  trx: DB | DBTransaction = db
) => {
  if (data.length === 0) return [];

  const res = await trx
    .insert(artworks)
    .values(data.map((d) => ({ ...d, generatorVersion: CURRENT_ARTWORK_GENERATOR_VERSION })))
    .onConflictDoNothing({ target: artworks.hash })
    .returning();

  // For rows that conflicted and were skipped, we need to fetch them manually
  // so the caller still gets the full list of artwork records.
  if (res.length < data.length) {
    const hashes = data.map((d) => d.hash);
    const existing = await trx.select().from(artworks).where(inArray(artworks.hash, hashes));

    // Merge inserted and existing records
    return [...res, ...existing.filter((e) => !res.some((r) => r.id === e.id))];
  }

  return res;
};

export const linkArtworksToSong = async (
  data: (typeof artworksSongs.$inferInsert)[],
  trx: DB | DBTransaction = db
) => {
  if (data.length === 0) return [];
  return trx.insert(artworksSongs).values(data).onConflictDoNothing().returning();
};

export const syncSongArtworks = async (
  songId: number,
  artworksIds: number[],
  trx: DB | DBTransaction = db
) => {
  // Get current artwork ids for the song
  const current = await trx
    .select({ artworkId: artworksSongs.artworkId })
    .from(artworksSongs)
    .where(eq(artworksSongs.songId, songId));

  const currentIds = current.map((row) => row.artworkId);

  // Determine which to add and which to remove
  const toAdd = artworksIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !artworksIds.includes(id));

  // Remove unlinked
  if (toRemove.length > 0) {
    await trx
      .delete(artworksSongs)
      .where(and(eq(artworksSongs.songId, songId), inArray(artworksSongs.artworkId, toRemove)));
  }

  // Add new links
  if (toAdd.length > 0) {
    await trx.insert(artworksSongs).values(toAdd.map((artworkId) => ({ songId, artworkId })));
  }

  // Return the final set
  return await trx
    .select({ artworkId: artworksSongs.artworkId })
    .from(artworksSongs)
    .where(eq(artworksSongs.songId, songId));
};

export interface SyncAlbumArtworksOptions {
  /**
   * When true, unlinks both LOCAL and REMOTE artworks that are not in artworksIds.
   * Defaults to false, which preserves Invariant BUG-08 (only unlinking REMOTE artworks).
   */
  replaceLocal?: boolean;
}

export const syncAlbumArtworks = async (
  albumId: number,
  artworksIds: number[],
  trx: DB | DBTransaction = db,
  options?: SyncAlbumArtworksOptions
) => {
  // 1. Get current artwork links for the album joined with artworks table
  const current = await trx
    .select({
      artworkId: albumsArtworks.artworkId,
      source: artworks.source
    })
    .from(albumsArtworks)
    .innerJoin(artworks, eq(albumsArtworks.artworkId, artworks.id))
    .where(eq(albumsArtworks.albumId, albumId));

  const currentIds = current.map((row) => row.artworkId);
  // Invariant BUG-08: By default, only remove REMOTE artworks that are not in the new artworksIds list,
  // preserving LOCAL-sourced artwork from being overwritten or destroyed.
  // When options?.replaceLocal is true (explicit user or auto-tag replacement), both LOCAL and REMOTE
  // artworks not in the new artworksIds list are unlinked.
  const toRemove = current
    .filter(
      (row) =>
        (options?.replaceLocal || row.source === 'REMOTE') && !artworksIds.includes(row.artworkId)
    )
    .map((row) => row.artworkId);

  // 2. Remove outdated artwork links
  if (toRemove.length > 0) {
    await trx
      .delete(albumsArtworks)
      .where(
        and(eq(albumsArtworks.albumId, albumId), inArray(albumsArtworks.artworkId, toRemove))
      );
  }

  // 3. Add new links
  const toAdd = artworksIds.filter((id) => !currentIds.includes(id));
  if (toAdd.length > 0) {
    await trx.insert(albumsArtworks).values(toAdd.map((artworkId) => ({ albumId, artworkId })));
  }

  // 4. Return final set
  return await trx
    .select({ artworkId: albumsArtworks.artworkId })
    .from(albumsArtworks)
    .where(eq(albumsArtworks.albumId, albumId));
};

export const linkArtworksToAlbum = async (
  data: (typeof albumsArtworks.$inferInsert)[],
  trx: DB | DBTransaction = db
) => {
  return trx.insert(albumsArtworks).values(data).onConflictDoNothing().returning();
};

export const linkArtworksToGenre = async (
  data: (typeof artworksGenres.$inferInsert)[],
  trx: DB | DBTransaction = db
) => {
  return trx.insert(artworksGenres).values(data).onConflictDoNothing().returning();
};

export const linkArtworksToArtist = async (
  data: (typeof artistsArtworks.$inferInsert)[],
  trx: DB | DBTransaction = db
) => {
  return trx.insert(artistsArtworks).values(data).onConflictDoNothing().returning();
};

export const linkArtworkToPlaylist = async (
  playlistId: number,
  artworkId: number,
  trx: DB | DBTransaction = db
) => {
  return await trx
    .insert(artworksPlaylists)
    .values({ playlistId, artworkId })
    .onConflictDoNothing();
};

export const getArtistOnlineArtworksCount = async (
  artistId: number,
  trx: DB | DBTransaction = db
) => {
  const data = await trx
    .select({ count: sql`COUNT(*)` })
    .from(artworks)
    .innerJoin(artistsArtworks, eq(artistsArtworks.artworkId, artworks.id))
    .where(eq(artistsArtworks.artistId, artistId));

  return data.at(0)?.count ?? 0;
};

export const deleteArtworks = async (artworkIds: number[], trx: DB | DBTransaction = db) => {
  const data = await trx.delete(artworks).where(inArray(artworks.id, artworkIds)).returning();
  return data;
};

export const updateArtwork = async (
  artworkId: number,
  data: Partial<typeof artworks.$inferInsert>,
  trx: DB | DBTransaction = db
) => {
  const updated = await trx.update(artworks).set(data).where(eq(artworks.id, artworkId));

  return updated;
};

export const getArtworkIdsOfSong = async (songId: number, trx: DB | DBTransaction = db) => {
  const data = await trx
    .select({ artworkId: artworksSongs.artworkId })
    .from(artworksSongs)
    .where(eq(artworksSongs.songId, songId));

  return data;
};

export const getUnusedArtworkIds = async (trx: DB | DBTransaction = db) => {
  const data = await trx
    .select({ id: artworks.id })
    .from(artworks)
    .where(
      and(
        sql`NOT EXISTS (SELECT 1 FROM artworks_songs WHERE artwork_id = ${artworks.id})`,
        sql`NOT EXISTS (SELECT 1 FROM albums_artworks WHERE artwork_id = ${artworks.id})`,
        sql`NOT EXISTS (SELECT 1 FROM artists_artworks WHERE artwork_id = ${artworks.id})`,
        sql`NOT EXISTS (SELECT 1 FROM artworks_genres WHERE artwork_id = ${artworks.id})`,
        sql`NOT EXISTS (SELECT 1 FROM artworks_playlists WHERE artwork_id = ${artworks.id})`
      )
    );
  return data;
};
