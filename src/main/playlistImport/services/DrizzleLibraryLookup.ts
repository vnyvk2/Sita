import { basename, extname } from 'path';
import { eq, like, ilike, or, inArray } from 'drizzle-orm';
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

  async findManyByCanonicalPaths(targetPaths: string[]): Promise<Map<string, LibrarySongRecord>> {
    const result = new Map<string, LibrarySongRecord>();
    if (!targetPaths || targetPaths.length === 0) return result;

    const uniquePaths = Array.from(new Set(targetPaths.filter(Boolean)));
    const CHUNK_SIZE = 500;

    // Stage 1: Batch exact path match
    const exactMatchedMap = new Map<string, LibrarySongRecord>();

    for (let i = 0; i < uniquePaths.length; i += CHUNK_SIZE) {
      const chunk = uniquePaths.slice(i, i + CHUNK_SIZE);
      const rows = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(inArray(songs.path, chunk));

      for (const song of rows) {
        const record: LibrarySongRecord = {
          id: song.id,
          path: song.path,
          title: song.title ?? undefined,
          duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
        };
        exactMatchedMap.set(song.path, record);
      }
    }

    const remainingPaths: string[] = [];
    for (const p of uniquePaths) {
      if (exactMatchedMap.has(p)) {
        result.set(p, exactMatchedMap.get(p)!);
      } else {
        remainingPaths.push(p);
      }
    }

    if (remainingPaths.length === 0) return result;

    // Stage 2: Batch slash direction variant match
    const altSlashMap = new Map<string, string>(); // altSlash -> originalPath
    for (const p of remainingPaths) {
      const alt = p.includes('\\') ? p.replaceAll('\\', '/') : p.replaceAll('/', '\\');
      altSlashMap.set(alt, p);
    }

    const altSlashList = Array.from(altSlashMap.keys());
    const altMatchedMap = new Map<string, LibrarySongRecord>();

    for (let i = 0; i < altSlashList.length; i += CHUNK_SIZE) {
      const chunk = altSlashList.slice(i, i + CHUNK_SIZE);
      const rows = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(inArray(songs.path, chunk));

      for (const song of rows) {
        const record: LibrarySongRecord = {
          id: song.id,
          path: song.path,
          title: song.title ?? undefined,
          duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
        };
        altMatchedMap.set(song.path, record);
      }
    }

    const unhandledPaths: string[] = [];
    for (const p of remainingPaths) {
      const alt = p.includes('\\') ? p.replaceAll('\\', '/') : p.replaceAll('/', '\\');
      if (altMatchedMap.has(alt)) {
        result.set(p, altMatchedMap.get(alt)!);
      } else {
        unhandledPaths.push(p);
      }
    }

    if (unhandledPaths.length === 0) return result;

    // Stage 3: Deterministic canonical normalization comparison with filename candidates
    const filenameToPaths = new Map<string, string[]>();
    for (const p of unhandledPaths) {
      const fname = basename(p);
      if (fname) {
        const existing = filenameToPaths.get(fname) || [];
        existing.push(p);
        filenameToPaths.set(fname, existing);
      }
    }

    const filenames = Array.from(filenameToPaths.keys());
    const LIKE_CHUNK_SIZE = 50;

    for (let i = 0; i < filenames.length; i += LIKE_CHUNK_SIZE) {
      const fnChunk = filenames.slice(i, i + LIKE_CHUNK_SIZE);
      const likeConditions = fnChunk.map((fn) => like(songs.path, `%${fn}`));

      const candidateRows = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(or(...likeConditions))
        .limit(1000);

      const canonicalDbMap = new Map<string, LibrarySongRecord>();
      for (const song of candidateRows) {
        const canonicalDbPath = normalizeCanonicalPath(song.path);
        if (!canonicalDbMap.has(canonicalDbPath)) {
          canonicalDbMap.set(canonicalDbPath, {
            id: song.id,
            path: song.path,
            title: song.title ?? undefined,
            duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
          });
        }
      }

      for (const fn of fnChunk) {
        const pathsForFn = filenameToPaths.get(fn) || [];
        for (const targetPath of pathsForFn) {
          if (!result.has(targetPath)) {
            const canonicalTarget = normalizeCanonicalPath(targetPath);
            const match = canonicalDbMap.get(canonicalTarget);
            if (match) {
              result.set(targetPath, match);
            }
          }
        }
      }
    }

    return result;
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

  async getCandidatesForFilenames(filenames: string[]): Promise<Map<string, LibrarySongRecord[]>> {
    const resultMap = new Map<string, LibrarySongRecord[]>();
    if (!filenames || filenames.length === 0) return resultMap;

    const uniqueFilenames = Array.from(new Set(filenames.filter(Boolean)));
    const LIKE_CHUNK_SIZE = 50;

    for (let i = 0; i < uniqueFilenames.length; i += LIKE_CHUNK_SIZE) {
      const chunk = uniqueFilenames.slice(i, i + LIKE_CHUNK_SIZE);
      const likeConditions = chunk.map((fn) => like(songs.path, `%${fn}`));

      const rows = await db
        .select({
          id: songs.id,
          path: songs.path,
          title: songs.title,
          duration: songs.duration
        })
        .from(songs)
        .where(or(...likeConditions))
        .limit(1000);

      for (const fn of chunk) {
        const fnLower = fn.toLowerCase();
        const matchedForFn: LibrarySongRecord[] = [];
        for (const song of rows) {
          const songPathLower = song.path.toLowerCase();
          if (songPathLower.endsWith(fnLower) || songPathLower.endsWith(fnLower.replace(/\\/g, '/'))) {
            matchedForFn.push({
              id: song.id,
              path: song.path,
              title: song.title ?? undefined,
              duration: song.duration !== null && song.duration !== undefined ? Number(song.duration) : undefined
            });
          }
        }
        if (matchedForFn.length > 0) {
          resultMap.set(fn, matchedForFn);
        }
      }
    }

    const unmatchedFilenames = uniqueFilenames.filter((fn) => !resultMap.has(fn) || resultMap.get(fn)!.length === 0);
    for (const fn of unmatchedFilenames) {
      const candidates = await this.getCandidatesForFilename(fn);
      if (candidates.length > 0) {
        resultMap.set(fn, candidates);
      }
    }

    return resultMap;
  }
}
