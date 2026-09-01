import type { CollectionId } from '../../../common/collections/types';
import type { MembershipCache } from './MembershipCache';
import type { BatchMembership, CollectionMembership, MembershipSource } from './types';

/**
 * MembershipService resolves reverse-lookups (song -> collections). It merges results from all
 * provided MembershipSources by union, removes duplicates, and returns them in a deterministic
 * order (by URI).
 */
export class MembershipService {
  private readonly cache: MembershipCache;
  private readonly sources: MembershipSource[];

  constructor(cache: MembershipCache, sources: MembershipSource[]) {
    this.cache = cache;
    this.sources = sources;
  }

  public async getCollectionsForSong(songId: number): Promise<readonly CollectionMembership[]> {
    const cached = this.cache.get(songId);
    if (cached) {
      return cached.map((collectionId) => ({ collectionId, songId }));
    }

    const collections = await this.fetchCollectionsForSong(songId);
    this.cache.set(songId, collections);

    return collections.map((collectionId) => ({ collectionId, songId }));
  }

  public async getCollectionsForSongs(songIds: readonly number[]): Promise<BatchMembership> {
    const missingSongIds: number[] = [];
    const songToCollections = new Map<number, readonly CollectionId[]>();

    // 1. Check cache
    for (const songId of songIds) {
      const cached = this.cache.get(songId);
      if (cached) {
        songToCollections.set(songId, cached);
      } else {
        missingSongIds.push(songId);
      }
    }

    // 2. Fetch misses in bulk
    if (missingSongIds.length > 0) {
      const fetchedMap = await this.fetchCollectionsForSongsBulk(missingSongIds);
      for (const [songId, collections] of fetchedMap.entries()) {
        this.cache.set(songId, collections);
        songToCollections.set(songId, collections);
      }
    }

    // 3. Compute tri-state batch membership
    const collectionCounts = new Map<string, { count: number; id: CollectionId }>();

    for (const songId of songIds) {
      const collections = songToCollections.get(songId) ?? [];
      for (const colId of collections) {
        const uri = colId.uri;
        const existing = collectionCounts.get(uri);
        if (existing) {
          existing.count++;
        } else {
          collectionCounts.set(uri, { count: 1, id: colId });
        }
      }
    }

    const batch: BatchMembership = { collections: [] };
    const totalSongs = songIds.length;

    for (const { count, id } of collectionCounts.values()) {
      batch.collections.push({
        collectionId: id,
        membershipState: count === totalSongs ? 'all' : 'some'
      });
    }

    // Sort deterministically
    batch.collections.sort((a, b) => a.collectionId.uri.localeCompare(b.collectionId.uri));

    return batch;
  }

  public invalidateSongs(songIds: readonly number[]): void {
    this.cache.invalidateSongs(songIds);
  }

  private async fetchCollectionsForSong(songId: number): Promise<readonly CollectionId[]> {
    const allCollections: CollectionId[] = [];

    for (const source of this.sources) {
      const sourceCollections = await source.getCollectionsForSong(songId);
      allCollections.push(...sourceCollections);
    }

    return this.mergeAndSortCollections(allCollections);
  }

  private async fetchCollectionsForSongsBulk(
    songIds: readonly number[]
  ): Promise<Map<number, readonly CollectionId[]>> {
    const allResults = new Map<number, CollectionId[]>();
    for (const songId of songIds) {
      allResults.set(songId, []);
    }

    for (const source of this.sources) {
      if (source.getCollectionsForSongs) {
        const bulkMap = await source.getCollectionsForSongs(songIds);
        for (const [songId, collections] of bulkMap.entries()) {
          allResults.get(songId)?.push(...collections);
        }
      } else {
        // Fallback to single fetches if bulk is not implemented
        for (const songId of songIds) {
          const collections = await source.getCollectionsForSong(songId);
          allResults.get(songId)?.push(...collections);
        }
      }
    }

    const finalMap = new Map<number, readonly CollectionId[]>();
    for (const [songId, collections] of allResults.entries()) {
      finalMap.set(songId, this.mergeAndSortCollections(collections));
    }

    return finalMap;
  }

  private mergeAndSortCollections(collections: CollectionId[]): readonly CollectionId[] {
    const unique = new Map<string, CollectionId>();

    for (const col of collections) {
      unique.set(col.uri, col);
    }

    const merged = Array.from(unique.values());
    merged.sort((a, b) => a.uri.localeCompare(b.uri));

    Object.freeze(merged);
    return merged;
  }
}
