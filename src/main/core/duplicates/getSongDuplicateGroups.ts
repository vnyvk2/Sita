/**
 * Database adapter for the duplicate song grouping engine.
 *
 * Queries songs from SQLite using Drizzle ORM, gathers their artist names
 * via the artists_songs junction table, maps rows into SongInput objects,
 * excludes already-dismissed groups from ignoredDuplicateMetadata,
 * and delegates grouping to findDuplicateSongGroups().
 */

import path from 'path';

import { db } from '@main/db/db';
import { getIgnoredDuplicateMetadata } from '@main/db/queries/ignoredItems';
import { songs } from '@main/db/schema';
import { eq, sql } from 'drizzle-orm';

import {
  type DuplicateGroup,
  findDuplicateSongGroups,
  type SongInput
} from './songDuplicates';

export async function getSongDuplicateGroups(): Promise<DuplicateGroup[]> {
  // 1) Fetch all non-blacklisted songs with concatenated artist names
  const rawRows = await db
    .select({
      id: songs.id,
      title: songs.title,
      durationSec: songs.duration,
      trackNo: songs.trackNumber,
      path: songs.path,
      bitrateKbps: songs.bitRate,
      sampleRateHz: songs.sampleRate,
      artist: sql<string>`COALESCE((
        SELECT GROUP_CONCAT(ar.name, ', ')
        FROM artists_songs asg
        JOIN artists ar ON ar.id = asg.artist_id
        WHERE asg.song_id = ${songs.id}
      ), '')`
    })
    .from(songs)
    .where(eq(songs.isBlacklisted, false));

  // 2) Map SQLite rows to SongInput
  const songInputs: SongInput[] = rawRows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    durationSec: row.durationSec,
    trackNo: row.trackNo,
    titleSource: 'tag', // conservative default; Tier A & B handle 1-Song / 01 Song
    path: row.path,
    format: row.path ? path.extname(row.path).replace('.', '').toLowerCase() : null,
    bitrateKbps: row.bitrateKbps,
    sampleRateHz: row.sampleRateHz
  }));

  // 3) Run pure grouping engine
  const groups = findDuplicateSongGroups(songInputs);

  // 4) Filter out groups dismissed by the user via ignoredDuplicateMetadata
  const ignored = await getIgnoredDuplicateMetadata();
  if (ignored.length === 0) {
    return groups;
  }

  const ignoredGroupKeys = new Set(
    ignored
      .filter((item) => item.duplicateGroupId.startsWith('songs_'))
      .map((item) => item.duplicateGroupId.replace('songs_', ''))
  );

  return groups.filter((group) => !ignoredGroupKeys.has(group.groupKey));
}
