import { db } from '@db/db';
import { genres, genresSongs } from '@db/schema';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { parseGenreList } from '../../../common/genreUtils';
import { linkArtworksToGenre } from './artworks';

export const isGenreWithIdAvailable = async (genreId: number, trx: DB | DBTransaction = db) => {
  const data = await trx.select({}).from(genres).where(eq(genres.id, genreId));

  return data.length > 0;
};

export const isGenreWithTitleAvailable = async (name: string, trx: DB | DBTransaction = db) => {
  const data = await trx.select({}).from(genres).where(eq(genres.name, name));

  return data.length > 0;
};

export type GetAllGenresReturnType = Awaited<ReturnType<typeof getAllGenres>>;

const defaultGetAllGenresOptions = {
  genreIds: [] as number[],
  genreNames: [] as string[],
  start: 0,
  end: 0,
  sortType: 'aToZ' as GenreSortTypes
};
export type GetAllGenresOptions = Partial<typeof defaultGetAllGenresOptions>;
export const getAllGenres = async (options: GetAllGenresOptions, trx: DB | DBTransaction = db) => {
  const { genreIds = [], genreNames = [], start = 0, end = 0, sortType = 'aToZ' } = options;

  const limit = end - start === 0 ? undefined : end - start;

  const data = await trx.query.genres.findMany({
    where: (s) => {
      const filters: SQL[] = [];

      // Filter by genre IDs
      if (genreIds && genreIds.length > 0) {
        filters.push(inArray(s.id, genreIds));
      }

      // Filter by genre names (case-insensitive)
      if (genreNames && genreNames.length > 0) {
        filters.push(inArray(s.nameCI, genreNames.map((n) => n.toLowerCase())));
      }

      return and(...filters);
    },
    with: {
      songs: { with: { song: { columns: { id: true, title: true } } } },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      }
    },
    limit,
    offset: start,
    orderBy: (artists) => {
      if (sortType === 'aToZ') return [asc(artists.name)];
      if (sortType === 'zToA') return [desc(artists.name)];

      return [];
    }
  });

  return {
    data,
    sortType,
    start,
    end
  };
};

export const getGenreWithTitle = async (name: string, trx: DB | DBTransaction = db) => {
  const data = await trx.query.genres.findFirst({
    where: (a) => eq(a.nameCI, name)
  });

  return data;
};

export const linkSongToGenre = async (
  genreId: number,
  songId: number,
  trx: DB | DBTransaction = db
) => {
  return trx.insert(genresSongs).values({ genreId, songId }).onConflictDoNothing().returning();
};

/**
 * Unlinks a song from a genre by deleting the relationship in the genresSongs table. This does NOT
 * delete the genre or song themselves - only the relationship between them.
 *
 * @param genreId - The ID of the genre
 * @param songId - The ID of the song
 * @param trx - Database transaction instance (defaults to main db connection)
 * @returns Promise that resolves when the relationship is deleted
 */
export const unlinkSongFromGenre = async (
  genreId: number,
  songId: number,
  trx: DB | DBTransaction = db
) => {
  return trx
    .delete(genresSongs)
    .where(and(eq(genresSongs.genreId, genreId), eq(genresSongs.songId, songId)));
};

export const createGenre = async (
  genre: typeof genres.$inferInsert,
  trx: DB | DBTransaction = db
) => {
  // Upsert: insert if new, otherwise perform a no-op update so RETURNING
  // always yields the row. This prevents duplicate genre creation from
  // concurrent song parsing (the unique index on nameCI deduplicates at
  // the DB level) and avoids a separate fallback lookup.
  const data = await trx
    .insert(genres)
    .values(genre)
    .onConflictDoUpdate({
      target: genres.nameCI,
      set: { updatedAt: sql`now()` }
    })
    .returning();

  return data[0];
};

export const getLinkedSongGenre = async (
  genreId: number,
  songId: number,
  trx: DB | DBTransaction = db
) => {
  const data = await trx
    .select()
    .from(genresSongs)
    .where(and(eq(genresSongs.genreId, genreId), eq(genresSongs.songId, songId)))
    .limit(1);

  return data.at(0);
};

export const getGenreByName = async (name: string, trx: DB | DBTransaction = db) => {
  const data = await trx.query.genres.findFirst({
    where: (g) => eq(g.nameCI, name)
  });

  return data;
};

export const getGenreSongIds = async (genreId: number, trx: DB | DBTransaction = db) => {
  const data = await trx
    .select({ songId: genresSongs.songId })
    .from(genresSongs)
    .where(eq(genresSongs.genreId, genreId));

  return data.map((row) => row.songId);
};

/**
 * Deletes a genre from the database.
 *
 * **Cascade Behavior:**
 *
 * - All entries in `genresSongs` linking this genre to songs are automatically deleted (ON DELETE
 *   CASCADE)
 * - All entries in `artworksGenres` linking this genre to artworks are automatically deleted (ON
 *   DELETE CASCADE)
 *
 * **Important:** This function should only be called after verifying the genre has no remaining
 * songs. Use `getGenreSongIds()` to check before deletion to prevent data inconsistency.
 *
 * @param genreId - The ID of the genre to delete
 * @param trx - Database transaction instance (defaults to main db connection)
 * @returns Promise that resolves when the genre is deleted
 */
export const deleteGenre = async (genreId: number, trx: DB | DBTransaction = db) => {
  return trx.delete(genres).where(eq(genres.id, genreId));
};

const reconcileExistingMultiGenresInTrx = async (trx: DBTransaction | DB) => {
  const allExistingGenres = await trx.query.genres.findMany({
    with: {
      songs: true,
      artworks: true
    }
  });

  let reconciledCount = 0;

  for (const genre of allExistingGenres) {
    const splitNames = parseGenreList(genre.name);
    // If the genre name splits into more than 1 distinct genre, or the parsed
    // form differs from the stored name in any way (delimiters, surrounding
    // whitespace), migrate to the canonical name. parseGenreList trims tokens,
    // so a single parsed name differing from the stored value is sufficient —
    // no separator check is needed.
    if (splitNames.length > 1 || (splitNames.length === 1 && splitNames[0] !== genre.name)) {
      for (const canonicalName of splitNames) {
        let canonicalGenre = await getGenreWithTitle(canonicalName, trx);
        if (!canonicalGenre) {
          canonicalGenre = await createGenre({ name: canonicalName }, trx);
        }

        // Migrate artwork if canonical genre does not have artwork (idempotent with onConflictDoNothing)
        if (genre.artworks && genre.artworks.length > 0) {
          for (const art of genre.artworks) {
            await linkArtworksToGenre(
              [{ artworkId: art.artworkId, genreId: canonicalGenre.id }],
              trx
            );
          }
        }

        // Migrate song relations (idempotent with onConflictDoNothing)
        if (genre.songs && genre.songs.length > 0) {
          for (const s of genre.songs) {
            await linkSongToGenre(canonicalGenre.id, s.songId, trx);
          }
        }
      }

      // Delete the old malformed genre record (cascade will clean up old genres_songs and artworks_genres)
      await deleteGenre(genre.id, trx);
      reconciledCount += 1;
    }
  }

  return { reconciledCount };
};

/**
 * Scans existing genres in the database for delimiter-separated names (e.g. "Rock,pop", "Rock; Pop", "Rock / Pop").
 * Splits each malformed genre into canonical genres, migrates song relationships (genres_songs) and
 * artworks (artworks_genres), and removes the obsolete malformed genre records.
 *
 * Guaranteed atomic and idempotent.
 */
export const reconcileExistingMultiGenres = async (trx?: DB | DBTransaction) => {
  if (trx && typeof (trx as DB).transaction !== 'function') {
    // Already within a transaction
    return reconcileExistingMultiGenresInTrx(trx);
  }

  const dbHandle = trx ?? db;
  return dbHandle.transaction(async (tx) => {
    return reconcileExistingMultiGenresInTrx(tx);
  });
};

