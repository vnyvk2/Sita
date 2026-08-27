import type { DBTransaction } from '@main/db/db';
import { getArtistWithName, createArtist, linkSongToArtist, unlinkSongFromArtist, getArtistSongIds, deleteArtist } from '@main/db/queries/artists';
import { linkSongToAlbum, unlinkSongFromAlbum, getAlbumWithTitle, createAlbum, getAlbumSongIds, deleteAlbum, linkArtistToAlbum } from '@main/db/queries/albums';
import { getGenreByName, createGenre, linkSongToGenre, unlinkSongFromGenre, getGenreSongIds, deleteGenre } from '@main/db/queries/genres';
import { saveArtworks, syncSongArtworks, syncAlbumArtworks } from '@main/db/queries/artworks';
import { getSongById } from '@main/db/queries/songs';
import { parseGenreList } from '../../common/genreUtils';

export interface SyncSongRelationalDataArgs {
  songId: number;
  /** Pre-fetched current song row (getSongById result) - read-only baseline */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  song: any;
  tags: SongTags;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processedArtwork?: { existing?: any; payloads?: any };
  trx: DBTransaction;
}

/**
 * Relational projection of a known-source metadata save:
 * artworks <-> song/album links, song artists, album linkage (+ artist fan-out),
 * genres - including safe cascade deletion of zero-reference entities.
 *
 * Extracted verbatim from updateSongId3Tags (P1 of pipeline unification):
 * behaviorally identical to the previous inline implementation.
 */
export const syncSongRelationalData = async ({
  songId,
  song,
  tags,
  processedArtwork,
  trx
}: SyncSongRelationalDataArgs): Promise<{ artworkData: any | undefined }> => {
// / / / / / SONG ARTWORK / / / / / / /
let artworkData: any;
if (processedArtwork) {
  artworkData = processedArtwork.existing;
  if (!artworkData && processedArtwork.payloads) {
    artworkData = await saveArtworks(processedArtwork.payloads, trx);
  }

  if (artworkData && artworkData.length > 0) {
    const artworkIds = artworkData.map((art: any) => art.id);
    // Link artwork to song
    await syncSongArtworks(songId, artworkIds, trx);

    // Invariant BUG-08: Synchronize album artwork for song's current album
    const songAlbumId = song.albums?.[0]?.album?.id;
    if (songAlbumId) {
      await syncAlbumArtworks(songAlbumId, artworkIds, trx);
    }
  }
}

// / / / / / SONG ARTISTS / / / / / / /
if (tags.artists) {
  // Get current artists linked to song
  const currentArtists = song.artists?.map((a: any) => a.artist) || [];
  const currentArtistIds = currentArtists.map((a: any) => a.id);

  // Separate new artists (without ID) from existing artists (with ID)
  const artistsWithoutIds = tags.artists.filter((artist) => !artist.artistId);
  const artistsWithIds = tags.artists.filter((artist) => artist.artistId);

  // Create new artists
  for (const artistData of artistsWithoutIds) {
    const existingArtist = await getArtistWithName(artistData.name, trx);

    if (existingArtist) {
      await linkSongToArtist(existingArtist.id, songId, trx);
    } else {
      const newArtist = await createArtist({ name: artistData.name }, trx);
      await linkSongToArtist(newArtist.id, songId, trx);
    }
  }

  // Handle existing artists - link newly linked ones
  const newlyLinkedArtistIds = artistsWithIds
    .filter((a) => !currentArtistIds.includes(Number(a.artistId)))
    .map((a) => Number(a.artistId));

  for (const artistId of newlyLinkedArtistIds) {
    await linkSongToArtist(artistId, songId, trx);
  }

  // Unlink removed artists
  const unlinkedArtistIds = currentArtistIds.filter((id: number) =>
    !artistsWithIds.some((a) => Number(a.artistId) === id)
  );

  for (const artistId of unlinkedArtistIds) {
    await unlinkSongFromArtist(artistId, songId, trx);

    // Check if artist should be deleted (no more songs)
    // Safe cascade pattern: Check for remaining songs before deletion
    // When artist is deleted, database CASCADE will automatically clean up:
    // - artistsSongs entries (already cleaned up above)
    // - albumsArtists entries
    // - artistsArtworks entries
    const artistSongIds = await getArtistSongIds(artistId, trx);
    if (artistSongIds.length === 0) {
      await deleteArtist(artistId, trx);
    }
  }
}

// / / / / / SONG ALBUM / / / / / /
if (tags.albums && tags.albums.length > 0) {
  // Get current album
  const currentAlbum = song.albums?.[0]?.album;

  let targetAlbumId: number | undefined;

  if (tags.albums[0].albumId) {
    // Link to existing album
    const albumId = Number(tags.albums[0].albumId);
    targetAlbumId = albumId;

    if (currentAlbum && currentAlbum.id !== albumId) {
      // Unlink from old album
      await unlinkSongFromAlbum(currentAlbum.id, songId, trx);

      // Check if old album should be deleted (no more songs)
      const albumSongIds = await getAlbumSongIds(currentAlbum.id, trx);
      if (albumSongIds.length === 0) {
        await deleteAlbum(currentAlbum.id, trx);
      }
    }

    if (!currentAlbum || currentAlbum.id !== albumId) {
      await linkSongToAlbum(albumId, songId, trx);
    }
  } else {
    // Create new album or link by title
    const existingAlbum = await getAlbumWithTitle(tags.albums[0].title, trx);

    if (existingAlbum) {
      targetAlbumId = existingAlbum.id;
      await linkSongToAlbum(existingAlbum.id, songId, trx);
    } else {
      const newAlbum = await createAlbum({ title: tags.albums[0].title }, trx);
      targetAlbumId = newAlbum.id;
      await linkSongToAlbum(newAlbum.id, songId, trx);
    }

    // Unlink from old album if it existed
    if (currentAlbum) {
      await unlinkSongFromAlbum(currentAlbum.id, songId, trx);

      // Safe cascade pattern: Verify no remaining songs before deletion
      const albumSongIds = await getAlbumSongIds(currentAlbum.id, trx);
      if (albumSongIds.length === 0) {
        await deleteAlbum(currentAlbum.id, trx);
      }
    }
  }

  // Relational Sync: Ensure all song artists and artworks are linked to the target album
  if (targetAlbumId) {
    const updatedSongState = await getSongById(songId, trx);
    const songArtistIds = updatedSongState?.artists?.map((a: any) => a.artist.id) ?? [];
    for (const artistId of songArtistIds) {
      await linkArtistToAlbum(targetAlbumId, artistId, trx);
    }

    if (processedArtwork && artworkData && artworkData.length > 0) {
      await syncAlbumArtworks(targetAlbumId, artworkData.map((art: any) => art.id), trx);
    }
  }
} else if (song.albums && song.albums.length > 0) {
  // User removed the album
  const currentAlbum = song.albums[0].album;
  await unlinkSongFromAlbum(currentAlbum.id, songId, trx);

  // Safe cascade pattern: Verify no remaining songs before deletion
  const albumSongIds = await getAlbumSongIds(currentAlbum.id, trx);
  if (albumSongIds.length === 0) {
    await deleteAlbum(currentAlbum.id, trx);
  }
}

// / / / / / SONG GENRES / / / / / /
if (tags.genres) {
  // Expand and normalize any compound/delimiter genres into canonical list
  const normalizedGenreItems: { genreId?: number; name: string }[] = [];
  const seen = new Set<string>();

  for (const genreData of tags.genres) {
    if (genreData.genreId) {
      const lower = genreData.name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        normalizedGenreItems.push(genreData);
      }
    } else {
      const splitNames = parseGenreList(genreData.name);
      for (const name of splitNames) {
        const lower = name.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          normalizedGenreItems.push({ name, genreId: undefined });
        }
      }
    }
  }

  // Get current genres linked to song
  const currentGenres = song.genres?.map((g: any) => g.genre) || [];
  const currentGenreIds = currentGenres.map((g: any) => g.id);

  // Separate new genres from existing ones
  const genresWithoutIds = normalizedGenreItems.filter((genre) => !genre.genreId);
  const genresWithIds = normalizedGenreItems.filter((genre) => genre.genreId);

  // Create new genres
  for (const genreData of genresWithoutIds) {
    const existingGenre = await getGenreByName(genreData.name, trx);

    if (existingGenre) {
      await linkSongToGenre(existingGenre.id, songId, trx);
    } else {
      const newGenre = await createGenre({ name: genreData.name }, trx);
      await linkSongToGenre(newGenre.id, songId, trx);
    }
  }

  // Link newly linked genres
  const newlyLinkedGenreIds = genresWithIds
    .filter((g: any) => !currentGenreIds.includes(Number(g.genreId)))
    .map((g) => Number(g.genreId));

  for (const genreId of newlyLinkedGenreIds) {
    await linkSongToGenre(genreId, songId, trx);
  }

  // Unlink removed genres
  const unlinkedGenreIds = currentGenreIds.filter((id: number) =>
    !genresWithIds.some((g) => Number(g.genreId) === id)
  );

  for (const genreId of unlinkedGenreIds) {
    await unlinkSongFromGenre(genreId, songId, trx);

    // Check if genre should be deleted (no more songs)
    // Safe cascade pattern: Check for remaining songs before deletion
    // When genre is deleted, database CASCADE will automatically clean up:
    // - genresSongs entries (already cleaned up above)
    // - artworksGenres entries
    const genreSongIds = await getGenreSongIds(genreId, trx);
    if (genreSongIds.length === 0) {
      await deleteGenre(genreId, trx);
    }
  }
}
  return { artworkData };
};
