/**
 * Adversarial Reproduction Script: Team 04 (React 19 & TanStack Query State Consistency)
 * 
 * Demonstrates:
 * 1. songs/likes event does NOT invalidate songQuery.ids, leaving the Favorites filter view permanently stale.
 * 2. songs/updatedSong event does NOT invalidate songQuery.allSongInfo or songQuery.singleSongInfo, leaving album/playlist/genre views stale.
 * 3. invalidateWindowsContainingIds ignores windows with custom keyPrefix ('queue', 'add-to-playlist').
 */

import assert from 'node:assert';

// Simulated getInvalidationTargetsForEvent matching src/renderer/src/hooks/useDataSync.tsx:61-173
function getInvalidationTargetsForEvent(dataType) {
  switch (dataType) {
    case 'songs':
    case 'songs/newSong':
    case 'songs/deletedSong':
    case 'blacklist/songBlacklist':
      return [
        'songs:all',
        'songs:ids',
        'songs:facets',
        'songs:recentlyAdded',
        'songs:history',
        'search:query',
        'home:recentlyPlayedSongs',
        'analytics:listening',
        'analytics:libraryStats'
      ];

    case 'songs/updatedSong':
      return [
        'songs:all',
        'songs:ids',
        'songs:facets',
        'songs:recentlyAdded',
        'songs:history',
        'search:query',
        'home:recentlyPlayedSongs',
        'analytics:listening'
      ];

    case 'songs/likes':
      return ['songs:favorites', 'home:mostLovedSongs', 'songs:singleInfo', 'songs:windows'];

    case 'songs/listeningData':
    case 'songs/listeningData/fullSongListens':
    case 'songs/listeningData/skips':
    case 'songs/listeningData/listens':
    case 'songs/listeningData/inNoOfPlaylists':
      return ['home:recentlyPlayedSongs', 'analytics:listening'];

    case 'songs/lyrics':
      return [];

    default:
      return [];
  }
}

// Minimal TanStack Query cache simulation
class QueryCacheMock {
  constructor() {
    this.queries = new Map();
  }

  setQuery(key, data, isStale = false) {
    this.queries.set(JSON.stringify(key), { key, data, isStale });
  }

  getQuery(key) {
    return this.queries.get(JSON.stringify(key));
  }

  findAll(predicate) {
    const results = [];
    for (const entry of this.queries.values()) {
      if (predicate(entry.key)) {
        results.push(entry);
      }
    }
    return results;
  }

  invalidate(targetKeyPrefix) {
    for (const [kStr, entry] of this.queries.entries()) {
      let match = false;
      if (Array.isArray(targetKeyPrefix)) {
        match = targetKeyPrefix.every((part, idx) => entry.key[idx] === part);
      }
      if (match) {
        entry.isStale = true;
      }
    }
  }
}

console.log('=== TEST 1: Favorites Filter Invalidation Miss on Unliking ===');
const cache = new QueryCacheMock();

// Songs page with Favorites filter active
const songIdsFavoritesKey = ['songs', 'ids', { sortType: 'aToZ', filterType: 'favorites' }];
cache.setQuery(songIdsFavoritesKey, { ids: [101, 102, 103], total: 3 }, false);

// Legacy favorites query
const legacyFavoritesKey = ['songs', 'favorites', 'sortType=aToZ'];
cache.setQuery(legacyFavoritesKey, [{ songId: 101 }, { songId: 102 }, { songId: 103 }], false);

// User unlikes song 102 -> 'songs/likes' event emitted
const targets = getInvalidationTargetsForEvent('songs/likes');
console.log('Returned invalidation targets for songs/likes:', targets);

// Check if 'songs:ids' is in targets
const hasSongsIds = targets.includes('songs:ids');
console.log('Does songs/likes target songs:ids?', hasSongsIds);
assert.strictEqual(hasSongsIds, false, 'Expected songs/likes to NOT include songs:ids');

// Perform invalidations as useDataSync.tsx does
for (const target of targets) {
  if (target === 'songs:favorites') {
    cache.invalidate(['songs', 'favorites']);
  }
  if (target === 'songs:ids') {
    cache.invalidate(['songs', 'ids']);
  }
}

console.log('Is legacy favorites query invalidated?', cache.getQuery(legacyFavoritesKey).isStale);
console.log('Is active Songs page favorites filter invalidated?', cache.getQuery(songIdsFavoritesKey).isStale);

assert.strictEqual(cache.getQuery(legacyFavoritesKey).isStale, true);
assert.strictEqual(cache.getQuery(songIdsFavoritesKey).isStale, false, 'DEFECT CONFIRMED: Active songs:ids query is NOT invalidated!');

console.log('\n=== TEST 2: Tag Update (songs/updatedSong) Omits songs:allInfo ===');
const updatedSongTargets = getInvalidationTargetsForEvent('songs/updatedSong');
console.log('songs/updatedSong targets:', updatedSongTargets);

const hasAllInfo = updatedSongTargets.includes('songs:allInfo');
const hasSingleInfo = updatedSongTargets.includes('songs:singleInfo');
console.log('Does songs/updatedSong target songs:allInfo?', hasAllInfo);
console.log('Does songs/updatedSong target songs:singleInfo?', hasSingleInfo);

assert.strictEqual(hasAllInfo, false, 'DEFECT CONFIRMED: songs:allInfo omitted from updatedSong!');
assert.strictEqual(hasSingleInfo, false, 'DEFECT CONFIRMED: songs:singleInfo omitted from updatedSong!');

console.log('\n=== TEST 3: Queue Windows Ignored by invalidateWindowsContainingIds ===');
// Simulated queue window query
const queueWindowKey = ['queue', 'window', 'active:0', 0];
cache.setQuery(queueWindowKey, [{ songId: 101, title: 'Old Title' }], false);

// Simulated songs window query
const songWindowKey = ['songs', 'window', 'ids={"sortType":"aToZ"}', 1700000000, 0];
cache.setQuery(songWindowKey, [{ songId: 101, title: 'Old Title' }], false);

// Invalidate function from useDataSync.tsx lines 272-315
function invalidateWindows(client, changedId) {
  // QueryCache findAll searches ONLY songQuery.ids._def: ['songs', 'ids']
  const idQueries = client.findAll(key => key[0] === 'songs' && key[1] === 'ids');
  for (const listQuery of idQueries) {
    // Generates window query with prefix ['songs', 'window']
    client.invalidate(['songs', 'window']);
  }
}

invalidateWindows(cache, 101);
console.log('Song window invalidated:', cache.getQuery(songWindowKey).isStale);
console.log('Queue window invalidated:', cache.getQuery(queueWindowKey).isStale);

assert.strictEqual(cache.getQuery(songWindowKey).isStale, true);
assert.strictEqual(cache.getQuery(queueWindowKey).isStale, false, 'DEFECT CONFIRMED: Queue window was completely ignored!');

console.log('\nALL 3 REACT & TANSTACK QUERY INVARIANTS PROVEN BROKEN!');
