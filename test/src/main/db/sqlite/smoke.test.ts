import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Real-fixture smoke for the SQLite build: PRODUCTION PATH end-to-end.
// NORA_DB_FILE points the real db.ts singleton at a real file; no db mocks.
// Journey: ingest (production ingestion path) -> search engines -> favorite toggle
// -> playlist (PlaylistEngine, real ops/journal) -> close/reopen (restart persistence).
// vi.hoisted runs before static imports are evaluated — db.ts reads this env var
// at module-eval time, so it must be set before the hoisted import of '@main/db/db'.
const smokeEnv = vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  process.env.NORA_DB_FILE =
    fs.mkdtempSync(path.join(os.tmpdir(), 'nora-smoke-')) + path.sep + 'smoke.db';
});

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: undefined, payloads: undefined }),
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

import { getEngine, closeDatabaseInstance, db } from '@main/db/db';
import { ingestTrackDTO } from '@main/parseSong/ingestTrackDTO';
import { SongSearchEngine } from '@main/search/engines/SongSearchEngine';
import { ArtistSearchEngine } from '@main/search/engines/ArtistSearchEngine';
import { normalizeQuery } from '@main/search/normalize/normalizeQuery';
import toggleLikeSongs from '@main/core/toggleLikeSongs';
import { PlaylistEngine } from '@main/collections/engine/PlaylistEngine';
import { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import { OperationJournalWriter } from '@main/collections/operations/OperationJournalWriter';
import { OperationExecutor } from '@main/collections/operations/OperationExecutor';
import { MembershipService } from '@main/collections/membership/MembershipService';
import { MembershipCache } from '@main/collections/membership/MembershipCache';
import {
  musicFolders,
  songs,
  smartPlaylistRules,
  playlists,
  playlistEntries,
  playHistory
} from '@main/db/schema';
import { eq, sql } from 'drizzle-orm';

const FIXTURE_TRACKS = [
  { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, Were Dreaming', genre: 'Synthwave', duration: '243.2' },
  { title: 'Midnight Surround', artist: 'M83', album: 'Hurry Up, Were Dreaming', genre: 'Synthwave', duration: '201.0' },
  { title: 'Golden Hour', artist: 'JVKE', album: 'This Is What ___ Feels Like', genre: 'Pop', duration: '209.5' }
];

const smokeFixture = {
  tmpDir: '',
  songIds: [] as number[],
  playlistId: 0
};

const ingestFixture = async () => {
  await db.insert(musicFolders).values({ name: 'Smoke', path: 'C:\\Smoke' });
  for (let i = 0; i < FIXTURE_TRACKS.length; i++) {
    const t = FIXTURE_TRACKS[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await ingestTrackDTO({
      songPath: `C:\\Smoke\\track_${i}.mp3`,
      title: t.title,
      duration: t.duration,
      artists: [t.artist],
      albumArtists: [t.artist],
      album: t.album,
      genres: [t.genre],
      year: 2022,
      sampleRate: 44100,
      bitRate: 320000,
      noOfChannels: 2,
      diskNumber: 1,
      trackNumber: i + 1,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date(),
      folderId: 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, db, undefined);
    smokeFixture.songIds.push(res.songData.id);
  }
};

describe('SQLite migration — real-fixture smoke (production path)', () => {
  beforeAll(async () => {
    smokeFixture.tmpDir = path.dirname(process.env.NORA_DB_FILE!);
    await ingestFixture();
  });

  afterAll(async () => {
    await closeDatabaseInstance();
    try {
      fs.rmSync(smokeFixture.tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch {
      /* Windows transient locks; OS cleans temp */
    }
  });

  it('ingested all fixture tracks with relations resolved', async () => {
    expect(smokeFixture.songIds).toHaveLength(3);
    const genresOf = await db
      .select({ title: songs.title, genre: sql<string>`g.name` })
      .from(songs)
      .innerJoin(sql`genres_songs gs ON gs.song_id = ${songs.id}`)
      .innerJoin(sql`genres g ON g.id = gs.genre_id`);
    expect(genresOf.length).toBe(3);
    expect(genresOf.map((j) => j.genre)).toContain('Synthwave');
  });

  it('search: exact, punctuated-insensitive, fuzzy, and artist-metadata matches', async () => {
    const exact = await SongSearchEngine.search(normalizeQuery('Midnight City'));
    expect(exact.some((m) => m.kind === 'song' && m.id === smokeFixture.songIds[0])).toBe(true);

    const punct = await SongSearchEngine.search(normalizeQuery('midnight-city!'));
    expect(punct.some((m) => m.kind === 'song' && m.id === smokeFixture.songIds[0])).toBe(true);

    const fuzzy = await SongSearchEngine.search(normalizeQuery('Golden Hou'));
    expect(fuzzy.some((m) => m.kind === 'song' && m.id === smokeFixture.songIds[2])).toBe(true);

    const byArtist = await ArtistSearchEngine.search(normalizeQuery('M83'));
    expect(byArtist.some((m) => m.kind === 'artist')).toBe(true);
  });

  it('favorite toggle persists and inverts atomically', async () => {
    await toggleLikeSongs([smokeFixture.songIds[0]], undefined);
    let row = getEngine()!.get(`SELECT is_favorite FROM songs WHERE id = ${smokeFixture.songIds[0]}`);
    expect(row.is_favorite).toBe(1);
    await toggleLikeSongs([smokeFixture.songIds[0]], undefined);
    row = getEngine()!.get(`SELECT is_favorite FROM songs WHERE id = ${smokeFixture.songIds[0]}`);
    expect(row.is_favorite).toBe(0);
    await toggleLikeSongs([smokeFixture.songIds[0]], true);
    row = getEngine()!.get(`SELECT is_favorite FROM songs WHERE id = ${smokeFixture.songIds[0]}`);
    expect(row.is_favorite).toBe(1);
  });

  it('playlist via PlaylistEngine (real ops + journal) + smart rules + play history', async () => {
    const playlistEngine = new PlaylistEngine(
      new PlaylistRepository(),
      new MembershipService(new MembershipCache(), []),
      new OperationExecutor(new OperationJournalWriter())
    );

    const [pl] = await db.insert(playlists).values({ name: 'Smoke Mix' }).returning();
    smokeFixture.playlistId = pl.id;
    await playlistEngine.addSongs({ playlistId: pl.id, songIds: smokeFixture.songIds });

    const entries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, pl.id));
    expect(entries).toHaveLength(3);

    await db.insert(smartPlaylistRules).values({
      playlistId: pl.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ruleAst: { type: 'group', logicalOperator: 'and', rules: [] } as never,
      dependencies: []
    });
    expect(
      (await db.select().from(smartPlaylistRules).where(eq(smartPlaylistRules.playlistId, pl.id))).length
    ).toBe(1);

    await db.insert(playHistory).values({ songId: smokeFixture.songIds[0] });
    expect((await db.select().from(playHistory)).length).toBe(1);
  });

  it('RESTART: close + reopen the same file preserves everything', async () => {
    const songIds = smokeFixture.songIds;
    await closeDatabaseInstance();

    // reopen through the production singleton (fresh module state, same file)
    vi.resetModules();
    const reopened = await import('@main/db/db');
    const engine = reopened.getEngine()!;

    expect(Number((engine.get('SELECT COUNT(*) c FROM songs') as { c: number }).c)).toBe(3);
    expect(engine.get(`SELECT is_favorite FROM songs WHERE id = ${songIds[0]}`).is_favorite).toBe(1);
    expect(
      Number((engine.get('SELECT COUNT(*) c FROM playlist_entries') as { c: number }).c)
    ).toBe(3);
    expect(
      Number((engine.get('SELECT COUNT(*) c FROM fts_songs') as { c: number }).c)
    ).toBe(3);
    expect(
      (engine.get('PRAGMA integrity_check') as { integrity_check: string }).integrity_check
    ).toBe('ok');

    // search still works against the reopened file — import fresh module instances
    // (vi.resetModules() re-binds; static imports in this file still hold the closed one,
    // mirroring how a real process restart re-binds every module)
    const { SongSearchEngine: FreshSongSearch } = await import('@main/search/engines/SongSearchEngine');
    const results = await FreshSongSearch.search(normalizeQuery('Golden Hour'));
    expect(results.some((m) => m.kind === 'song' && m.id === songIds[2])).toBe(true);

    // sanity: seeding does not duplicate after reopen
    expect((await reopened.db.select().from(songs)).length).toBe(3);
  });
});
