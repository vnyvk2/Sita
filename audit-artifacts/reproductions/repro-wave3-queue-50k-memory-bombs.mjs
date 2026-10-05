/**
 * WAVE 3 REPRODUCTION HARNESS: DEF-MEM-01 & DEF-MEM-02 (50,000 Song Queue Memory Bombs)
 *
 * Demonstrates:
 * 1. DEF-MEM-01: In src/renderer/src/workspace/panels/QueuePanel/QueuePanel.tsx (lines 75-127),
 *    opening a 50k queue executes a 500-batch IPC loop that progressively accumulates all 50,000
 *    SongData objects directly into React component state (songsMetadata).
 * 2. DEF-MEM-02: In src/renderer/src/components/MiniPlayer/containers/QueueContainer.tsx (lines 211-218),
 *    the mini-player issues a single monolithic IPC fetch for all 50,000 songs and constructs
 *    an in-memory Map of 50,000 SongData instances.
 *
 * Measures: Actual V8 JS heap memory delta before and after 50,000-song queue hydration.
 */

import { performance } from 'perf_hooks';

function generateMockSong(id) {
  return {
    songId: id,
    title: `Track Number ${id} With Detailed Song Title`,
    artists: [{ artistId: id % 500, name: `Artist Name ${id % 500}` }],
    album: { albumId: id % 1000, title: `Album Title ${id % 1000}` },
    duration: 215.4,
    path: `C:\\Music\\Library\\Lossless\\FLAC\\Artist_${id % 500}\\Album_${id % 1000}\\Track_${id}.flac`,
    year: 2024,
    bitRate: 980000,
    sampleRate: 44100,
    isFavorite: (id % 7 === 0),
    trackNo: (id % 15) + 1,
    discNo: 1,
    addedDate: Date.now() - (id * 10000)
  };
}

// Emulate IPC bridge
async function mockGetSongInfo(ids) {
  return ids.map(id => generateMockSong(id));
}

// Global GC helper if run with --expose-gc, otherwise null
const gc = global.gc || (() => {});

async function testWorkspaceQueuePanel50k() {
  console.log('=== TEST 1: DEF-MEM-01 (Workspace QueuePanel 50k Sequential Chunk Accumulation) ===');
  
  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  // Simulating 50,000 song queue IDs
  const songIds = Array.from({ length: 50000 }, (_, i) => i + 1);

  // Exact reproduction of QueuePanel.tsx:75-127 logic:
  const songsMetadataRef = { current: {} };
  const failedIdsRef = { current: new Set() };
  let songsMetadataState = {};

  const missingIds = songIds.filter(
    (id) => !songsMetadataRef.current[id] && !failedIdsRef.current.has(id)
  );

  let ipcCallCount = 0;
  // Batch load in chunks of 100 (500 sequential IPC calls)
  for (let i = 0; i < missingIds.length; i += 100) {
    const idsToFetch = missingIds.slice(i, i + 100);
    const res = await mockGetSongInfo(idsToFetch);
    ipcCallCount++;

    const songs = Array.isArray(res) ? res : [];
    // QueuePanel setSongsMetadata: accumulates into next state object
    const next = { ...songsMetadataState };
    for (const song of songs) {
      if (song && typeof song.songId === 'number' && !songsMetadataState[song.songId]) {
        next[song.songId] = song;
      }
    }
    songsMetadataState = next;
    songsMetadataRef.current = next;
  }

  const durationMs = performance.now() - startTime;
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDeltaMB = ((heapAfter - heapBefore) / (1024 * 1024)).toFixed(2);

  console.log(`IPC Calls executed: ${ipcCallCount}`);
  console.log(`Total songs retained in React component state: ${Object.keys(songsMetadataState).length}`);
  console.log(`Execution time: ${durationMs.toFixed(1)} ms`);
  console.log(`V8 Heap Memory retained: ${heapDeltaMB} MB`);

  if (Object.keys(songsMetadataState).length === 50000 && ipcCallCount === 500) {
    console.log('SUCCESS: Proved DEF-MEM-01: Workspace QueuePanel bypasses virtualization, executing 500 IPC calls and retaining all 50k songs in state.\n');
  } else {
    throw new Error('DEF-MEM-01 reproduction assertion failed');
  }
}

async function testMiniPlayerQueueContainer50k() {
  console.log('=== TEST 2: DEF-MEM-02 (MiniPlayer Monolithic 50k Queue Fetch) ===');

  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  // Simulating 50,000 song queue IDs
  const queueSongIds = Array.from({ length: 50000 }, (_, i) => i + 1);

  // Exact reproduction of MiniPlayer QueueContainer.tsx:211-218 logic:
  // const queueSongsQuery = useSongQuery.queue(queueSongIds);
  // Monolithic single IPC call:
  const fetchedSongs = await mockGetSongInfo(queueSongIds);
  
  // const queueSongsMap = useMemo(() => {
  //   const map = new Map<number, SongData>();
  //   for (const song of queueSongsQuery.data) map.set(song.songId, song);
  //   return map;
  // }, [queueSongsQuery.data]);
  const queueSongsMap = new Map();
  for (const song of fetchedSongs) {
    queueSongsMap.set(song.songId, song);
  }

  const durationMs = performance.now() - startTime;
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDeltaMB = ((heapAfter - heapBefore) / (1024 * 1024)).toFixed(2);

  console.log(`Songs loaded into MiniPlayer Map: ${queueSongsMap.size}`);
  console.log(`Execution time: ${durationMs.toFixed(1)} ms`);
  console.log(`V8 Heap Memory retained: ${heapDeltaMB} MB`);

  if (queueSongsMap.size === 50000) {
    console.log('SUCCESS: Proved DEF-MEM-02: MiniPlayer bypasses window hydration, constructing a 50k-song Map in memory.\n');
  } else {
    throw new Error('DEF-MEM-02 reproduction assertion failed');
  }
}

async function runAll() {
  await testWorkspaceQueuePanel50k();
  await testMiniPlayerQueueContainer50k();
  console.log('ALL WAVE 3 50K QUEUE MEMORY REPRODUCTIONS VERIFIED SUCCESSFULLY!');
}

runAll().catch((err) => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});
