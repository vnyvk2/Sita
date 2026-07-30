import { eq, like } from 'drizzle-orm';
import { db } from '../../db/db';
import { songs } from '../../db/schema';
import type { LibraryLookup, LibrarySongRecord } from '../interfaces/LibraryLookup';

export class DrizzleLibraryLookup implements LibraryLookup {
  async findByCanonicalPath(path: string): Promise<LibrarySongRecord | null> {
    const matchedSongs = await db
      .select({
        id: songs.id,
        path: songs.path,
        title: songs.title,
        artist: songs.artist,
        album: songs.album,
        duration: songs.duration
      })
      .from(songs)
      .where(eq(songs.path, path))
      .limit(1);

    if (matchedSongs.length === 0) {
      return null;
    }

    const song = matchedSongs[0];
    return {
      id: song.id,
      path: song.path,
      title: song.title ?? undefined,
      artist: song.artist ?? undefined,
      album: song.album ?? undefined,
      duration: song.duration ?? undefined
    };
  }

  async findByFilename(filename: string): Promise<LibrarySongRecord[]> {
    const matchedSongs = await db
      .select({
        id: songs.id,
        path: songs.path,
        title: songs.title,
        artist: songs.artist,
        album: songs.album,
        duration: songs.duration
      })
      .from(songs)
      .where(like(songs.path, `%${filename}`))
      .limit(10);

    return matchedSongs.map((song) => ({
      id: song.id,
      path: song.path,
      title: song.title ?? undefined,
      artist: song.artist ?? undefined,
      album: song.album ?? undefined,
      duration: song.duration ?? undefined
    }));
  }
}
