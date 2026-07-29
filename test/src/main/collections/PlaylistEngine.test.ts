import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import * as schema from '../../../../src/main/db/schema';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, and } from 'drizzle-orm';

// Mock DB
vi.mock('../../../../src/main/db/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');
  
  // Create an in-memory PGlite instance
  const client = await PGlite.create({ extensions: { pg_trgm, citext } });
  const db = drizzle(client, { schema });
  
  return { db, client };
});

import { db, client } from '../../../../src/main/db/db';
import { PlaylistEngine } from '../../../../src/main/collections/engine/PlaylistEngine';
import { PlaylistRepository } from '../../../../src/main/collections/repositories/PlaylistRepository';
import { OperationExecutor } from '../../../../src/main/collections/operations/OperationExecutor';
import { OperationJournalWriter } from '../../../../src/main/collections/operations/OperationJournalWriter';
import { MembershipService } from '../../../../src/main/collections/membership/MembershipService';
import { playlists, playlistEntries, operationJournal, songs } from '../../../../src/main/db/schema';

describe('PlaylistEngine', () => {
  let engine: PlaylistEngine;
  let repository: PlaylistRepository;
  let membershipService: MembershipService;
  
  beforeEach(async () => {
    // Run migrations on the in-memory DB
    await client.query(`CREATE EXTENSION IF NOT EXISTS citext;`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    
    const migrationsFolder = path.resolve(__dirname, '../../../../resources/drizzle');
    await migrate(db, { migrationsFolder });

    // Insert some mock songs so we don't hit foreign key constraints
    const now = new Date();
    const insertedSongs = await db.insert(songs).values([
      { title: 'Song A', path: '/a.mp3', duration: 100, fileCreatedAt: now, fileModifiedAt: now },
      { title: 'Song B', path: '/b.mp3', duration: 120, fileCreatedAt: now, fileModifiedAt: now },
      { title: 'Song C', path: '/c.mp3', duration: 140, fileCreatedAt: now, fileModifiedAt: now },
      { title: 'Song D', path: '/d.mp3', duration: 160, fileCreatedAt: now, fileModifiedAt: now },
    ]).returning({ id: songs.id });
    
    // Setup references to the generated song IDs for tests
    (globalThis as any).songIds = insertedSongs.map(s => s.id);

    repository = new PlaylistRepository();
    const journalWriter = new OperationJournalWriter();
    const executor = new OperationExecutor(journalWriter);
    
    // Mock membership service
    membershipService = {
      invalidateSongs: vi.fn(),
      getCollectionsForSong: vi.fn(),
    } as unknown as MembershipService;

    engine = new PlaylistEngine(repository, membershipService, executor);
  });

  afterEach(async () => {
    // Clear the DB tables after each test
    await db.delete(operationJournal);
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);
    vi.clearAllMocks();
  });

  it('should add 1 song, update statistics, write journal, and invalidate cache', async () => {
    // 1. Setup a playlist
    const [playlist] = await db.insert(playlists).values({ name: 'My Playlist' }).returning();
    const songId = (globalThis as any).songIds[0];
    
    // 2. Add song
    await engine.addSongs({
      playlistId: playlist.id,
      songIds: [songId]
    });

    // 3. Verify statistics updated
    const updatedPlaylist = await repository.getById(playlist.id);
    expect(updatedPlaylist?.itemCount).toBe(1);
    expect(Number(updatedPlaylist?.totalDuration)).toBe(100);

    // 4. Verify membership invalidation
    expect(membershipService.invalidateSongs).toHaveBeenCalledWith([songId]);

    // 5. Verify journal contents
    const journal = await db.select().from(operationJournal).where(and(eq(operationJournal.collectionType, 'playlist'), eq(operationJournal.collectionId, playlist.id)));
    expect(journal.length).toBe(1);
    expect(journal[0].operationType).toBe('playlist.addSongs');
    expect(journal[0].sequenceNumber).toBe(1);
  });

  it('should add 100 songs', async () => {
    const [playlist] = await db.insert(playlists).values({ name: 'Big Playlist' }).returning();
    
    // Mock 100 songs
    const now = new Date();
    const manySongs = Array.from({ length: 100 }, (_, i) => ({
      title: `Song ${i}`, path: `/path${i}.mp3`, duration: 10, fileCreatedAt: now, fileModifiedAt: now
    }));
    const insertedSongs = await db.insert(songs).values(manySongs).returning({ id: songs.id });

    const songIds = insertedSongs.map(s => s.id);
    
    await engine.addSongs({
      playlistId: playlist.id,
      songIds
    });

    const entries = await repository.getEntries(playlist.id);
    expect(entries.length).toBe(100);
    expect(entries[0].entry.position).toBe(0);
    expect(entries[99].entry.position).toBe(99);

    const updated = await repository.getById(playlist.id);
    expect(updated?.itemCount).toBe(100);
    expect(membershipService.invalidateSongs).toHaveBeenCalledWith(songIds);
  });
});
