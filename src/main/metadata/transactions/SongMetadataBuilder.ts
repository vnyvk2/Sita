import { getSongById } from '../../db/queries/songs';

/**
 * SongMetadataBuilder — builds a COMPLETE SongTags object by reading
 * the current song state from the database and merging changed fields.
 *
 * This prevents the "undefined = remove" bug where partial field maps
 * caused albums/artists/genres to be unlinked and deleted.
 *
 * Design:
 * - Reads current DB state once per song
 * - Preserves existing IDs (artistId, albumId, genreId) to avoid unnecessary
 *   find-or-create cycles in updateSongId3Tags
 * - Patches only the fields that actually changed
 * - Returns a deterministic, complete SongTags object every time
 */

export interface MetadataFieldChanges {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
}

export class SongMetadataBuilder {
  /**
   * Build a complete SongTags by merging field changes onto the current DB state.
   * Every field in the resulting SongTags is populated — no undefined relational fields.
   */
  public static async buildCompleteTags(
    songId: number,
    changes: MetadataFieldChanges
  ): Promise<SongTags> {
    const currentSong = await getSongById(songId);
    if (!currentSong) {
      throw new Error(`[SongMetadataBuilder] Song with id ${songId} not found in database`);
    }

    // Map current relational data, preserving IDs to avoid unnecessary create/unlink cycles
    const currentArtists: SongTagsArtistData[] =
      currentSong.artists?.map((a) => ({
        artistId: a.artist.id,
        name: a.artist.name
      })) ?? [];

    const currentAlbums: SongTagsAlbumData[] =
      currentSong.albums?.map((a) => ({
        albumId: a.album.id,
        title: a.album.title
      })) ?? [];

    const currentGenres: SongTagsGenreData[] =
      currentSong.genres?.map((g) => ({
        genreId: g.genre.id,
        name: g.genre.name
      })) ?? [];

    // Build complete SongTags — every field is populated
    return {
      title: changes.title ?? currentSong.title,
      duration: parseFloat(String(currentSong.duration ?? 0)),

      // Artists: preserve existing IDs when name hasn't changed
      artists:
        changes.artist !== undefined
          ? SongMetadataBuilder.mergeArtist(changes.artist, currentArtists)
          : currentArtists,

      // Albums: preserve existing IDs when title hasn't changed
      albums:
        changes.album !== undefined
          ? SongMetadataBuilder.mergeAlbum(changes.album, currentAlbums)
          : currentAlbums,

      // Genres: preserve existing IDs when name hasn't changed
      genres:
        changes.genre !== undefined
          ? SongMetadataBuilder.mergeGenre(changes.genre, currentGenres)
          : currentGenres,

      releasedYear: changes.year ?? currentSong.year ?? undefined,
      trackNumber: changes.trackNumber ?? currentSong.trackNumber ?? undefined
    };
  }

  /**
   * Merge artist change: if the name matches an existing artist, preserve the ID.
   * Otherwise return a new entry that will trigger find-or-create.
   */
  private static mergeArtist(
    newName: string,
    currentArtists: SongTagsArtistData[]
  ): SongTagsArtistData[] {
    const existing = currentArtists.find(
      (a) => a.name.toLowerCase() === newName.toLowerCase()
    );
    if (existing) {
      return [existing];
    }
    return [{ name: newName }];
  }

  /**
   * Merge album change: if the title matches an existing album, preserve the ID.
   * Otherwise return a new entry that will trigger find-or-create.
   */
  private static mergeAlbum(
    newTitle: string,
    currentAlbums: SongTagsAlbumData[]
  ): SongTagsAlbumData[] {
    const existing = currentAlbums.find(
      (a) => a.title.toLowerCase() === newTitle.toLowerCase()
    );
    if (existing) {
      return [existing];
    }
    return [{ title: newTitle }];
  }

  /**
   * Merge genre change: if the name matches an existing genre, preserve the ID.
   * Otherwise return a new entry that will trigger find-or-create.
   */
  private static mergeGenre(
    newName: string,
    currentGenres: SongTagsGenreData[]
  ): SongTagsGenreData[] {
    const existing = currentGenres.find(
      (g) => g.name.toLowerCase() === newName.toLowerCase()
    );
    if (existing) {
      return [existing];
    }
    return [{ name: newName }];
  }
}
