import { basename, extname } from 'path';
import { eq, like, ilike, or } from 'drizzle-orm';
import { db } from '../../db/db';
import { songs } from '../../db/schema';
import type { LibraryLookup, LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { LibraryCandidateProvider } from '../interfaces/LibraryCandidateProvider';
import { normalizeCanonicalPath } from '../utils/normalizeCanonicalPath';
import logger from '../../logger';

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

    // 3. Try deterministic canonical normalization comparison filtering candidates by target filename
    if (matchedSongs.length === 0) {
      const targetFilename = basename(targetPath);
      const candidates = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(like(songs.path, `%${targetFilename}`))
        .limit(100);

      if (candidates.length > 0) {
        const firstCandidate = candidates[0];
        const canonicalDbPath = normalizeCanonicalPath(firstCandidate.path);
        const isEqual = canonicalDbPath === canonicalTarget;

        logger.info(
          JSON.stringify({
            stage: 'CANONICAL_LOOKUP_INSPECTION',
            targetPath,
            canonicalTarget,
            databasePath: firstCandidate.path,
            canonicalDatabasePath: canonicalDbPath,
            equal: isEqual
          })
        );
      }

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
