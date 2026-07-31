import { eq, like } from 'drizzle-orm';
import { db } from '../../db/db';
import { songs } from '../../db/schema';
import type { LibraryLookup, LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { LibraryCandidateProvider } from '../interfaces/LibraryCandidateProvider';

export class DrizzleLibraryLookup implements LibraryLookup, LibraryCandidateProvider {
  async findByCanonicalPath(targetPath: string): Promise<LibrarySongRecord | null> {
    if (!targetPath) return null;

    // 1. Try exact path match
    let matchedSongs = await db
      .select({
        id: songs.id,
        path: songs.path,
        title: songs.title,
        duration: songs.duration
      })
      .from(songs)
      .where(eq(songs.path, targetPath))
      .limit(1);

    // 2. Try normalized slash direction match if exact fails
    if (matchedSongs.length === 0) {
      const targetAltSlash = targetPath.includes('\\')
        ? targetPath.replaceAll('\\', '/')
        : targetPath.replaceAll('/', '\\');

      matchedSongs = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(eq(songs.path, targetAltSlash))
        .limit(1);
    }

    if (matchedSongs.length === 0) {
      return null;
    }

    const song = matchedSongs[0];
    return {
      id: song.id,
      path: song.path,
      title: song.title ?? undefined,
      duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
    };
  }

  async getCandidatesForFilename(filename: string): Promise<LibrarySongRecord[]> {
    if (!filename) return [];

    const matchedSongs = await db
      .select({
        id: songs.id,
        path: songs.path,
        title: songs.title,
        duration: songs.duration
      })
      .from(songs)
      .where(like(songs.path, `%${filename}`))
      .limit(50);

    return matchedSongs.map((song) => ({
      id: song.id,
      path: song.path,
      title: song.title ?? undefined,
      duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
    }));
  }
}
