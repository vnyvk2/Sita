import { getSongById } from '../../db/queries/songs';
import { parseGenreList } from '../../../common/genreUtils';

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
  style?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  artworkPath?: string;
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

      // Genres & Styles: preserve existing IDs when names haven't changed
      genres:
        changes.genre !== undefined || changes.style !== undefined
          ? SongMetadataBuilder.mergeGenresAndStyles(changes.genre, changes.style, currentGenres)
          : currentGenres,

      releasedYear: changes.year !== undefined ? changes.year : (currentSong.year ?? undefined),
      trackNumber: changes.trackNumber !== undefined ? changes.trackNumber : (currentSong.trackNumber ?? undefined),
      discNumber: changes.discNumber !== undefined ? changes.discNumber : (currentSong.diskNumber ?? undefined),
      musicBrainzRecordingId:
        changes.musicBrainzRecordingId !== undefined
          ? changes.musicBrainzRecordingId
          : (currentSong.musicBrainzRecordingId ?? undefined),
      isrc: changes.isrc !== undefined ? changes.isrc : (currentSong.isrc ?? undefined),
      artworkPath: changes.artworkPath ?? undefined
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
   * Merge genre & style changes: preserves existing IDs when names match case-insensitively,
   * combining both genre and style strings into the SongTagsGenreData array through canonical tokenization.
   */
  private static mergeGenresAndStyles(
    genreStr: string | undefined,
    styleStr: string | undefined,
    currentGenres: SongTagsGenreData[]
  ): SongTagsGenreData[] {
    const rawInput = [genreStr, styleStr].filter((s): s is string => Boolean(s && s.trim()));
    const uniqueNames = parseGenreList(rawInput);
    if (uniqueNames.length === 0) return currentGenres;

    return uniqueNames.map((name) => {
      const existing = currentGenres.find(
        (g) => g.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        return existing;
      }
      return { name };
    });
  }
}
