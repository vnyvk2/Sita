import { db } from '../../src/main/db';
import { playlists as collections, playlistEntries as collectionEntries, songs } from '../../src/main/db/schema';
import { sql } from 'drizzle-orm';

async function seed() {
  console.log('Starting seed...');

  // Create a mock song first
  console.log('Creating a mock song...');
  const songResult = await db.insert(songs).values({
    songId: 'mock-song-1',
    title: 'Mock Song',
    path: '/mock/path/song.mp3',
    duration: 180,
    addedDate: Date.now()
  }).returning({ id: songs.songId });
  
  const songId = songResult[0].id;

  console.log('Creating 10,000 collections in a 10-level hierarchy...');
  
  let currentParentId: number | null = null;
  const collectionIds: number[] = [];

  for (let i = 0; i < 10000; i++) {
    // Every 1000 items, we create a new top-level folder
    if (i % 1000 === 0) {
      currentParentId = null;
    }

    const type = i % 10 === 0 ? 'FOLDER' : 'PLAYLIST';
    
    const result = await db.insert(collections).values({
      name: `Collection ${i}`,
      type,
      parentId: currentParentId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }).returning({ id: collections.id });

    const newId = result[0].id;
    collectionIds.push(newId);

    // Deep hierarchy up to 10 levels
    if (i % 10 < 9) {
      currentParentId = newId;
    }
  }

  console.log('Inserting 250,000 entries into playlists...');
  
  const playlists = await db.select({ id: collections.id }).from(collections).where(sql`type = 'PLAYLIST'`);
  
  let totalEntries = 0;
  for (let p of playlists) {
    if (totalEntries >= 250000) break;

    const entriesToInsert = [];
    // Give each playlist ~25 entries
    for (let e = 0; e < 28; e++) {
      entriesToInsert.push({
        collectionId: p.id,
        songId: songId,
        addedAt: Date.now(),
        trackNo: e + 1
      });
      totalEntries++;
    }

    await db.insert(collectionEntries).values(entriesToInsert);
  }

  console.log(`Seed complete! Inserted ${collectionIds.length} collections and ${totalEntries} entries.`);
}

seed().catch(console.error);
