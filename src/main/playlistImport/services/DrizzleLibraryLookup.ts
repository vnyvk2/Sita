import { extname } from 'path';
import { eq, like, ilike, or } from 'drizzle-orm';
import { db } from '../../db/db';
import { songs } from '../../db/schema';
import type { LibraryLookup, LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { LibraryCandidateProvider } from '../interfaces/LibraryCandidateProvider';
import { normalizeCanonicalPath } from '../utils/normalizeCanonicalPath';

export class DrizzleLibraryLookup implements LibraryLookup, LibraryCandidateProvider {
  async findByCanonicalPath(targetPath: string): Promise<LibrarySongRecord | null> {
    if (!targetPath) return null;
    const canonicalTarget = normalizeCanonicalPath(targetPath);

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

    // 2. Try slash direction variant match
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

    // 3. Try deterministic canonical normalization comparison if exact DB string queries fail
    if (matchedSongs.length === 0) {
      const candidates = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(like(songs.path, `%${extname(targetPath)}`))
        .limit(100);

      const canonicalMatch = candidates.find(
        (song) => normalizeCanonicalPath(song.path) === canonicalTarget
      );

      if (canonicalMatch) {
        matchedSongs = [canonicalMatch];
      }
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

    // 1. Try exact filename end match (%filename)
    let matchedSongs = await db
      .select({
        id: songs.id,
        path: songs.path,
        title: songs.title,
        duration: songs.duration
      })
      .from(songs)
      .where(like(songs.path, `%${filename}`))
      .limit(50);

    // 2. If no candidate found, strip leading track numbers & extension for fallback candidate retrieval
    if (matchedSongs.length === 0) {
      const ext = extname(filename);
      const nameWithoutExt = ext ? filename.slice(0, -ext.length) : filename;
      const cleanTitle = nameWithoutExt.replace(/^\d+[\s._-]+/, '').trim();

      if (cleanTitle.length > 1) {
        matchedSongs = await db
          .select({
            id: songs.id,
            path: songs.path,
            title: songs.title,
            duration: songs.duration
          })
          .from(songs)
          .where(
            or(
              like(songs.path, `%${cleanTitle}%`),
              ilike(songs.title, `%${cleanTitle}%`)
            )
          )
          .limit(50);
      }
    }

    return matchedSongs.map((song) => ({
      id: song.id,
      path: song.path,
      title: song.title ?? undefined,
      duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
    }));
  }
}
