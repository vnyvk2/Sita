import type { CollectionId } from '../../../common/collections/types';

export class MembershipCache {
  // songId -> collections reverse index
  private readonly index = new Map<number, readonly CollectionId[]>();

  public get(songId: number): readonly CollectionId[] | undefined {
    return this.index.get(songId);
  }

  public set(songId: number, collections: readonly CollectionId[]): void {
    // We expect the caller to pass an immutable or locally owned array,
    // but just to be safe, we freeze it to ensure strictly immutable behavior
    // inside and outside the cache.
    Object.freeze(collections);
    this.index.set(songId, collections);
  }

  public invalidateSong(songId: number): void {
    this.index.delete(songId);
  }

  public invalidateSongs(songIds: readonly number[]): void {
    for (const songId of songIds) {
      this.index.delete(songId);
    }
  }

  public clear(): void {
    this.index.clear();
  }
}
