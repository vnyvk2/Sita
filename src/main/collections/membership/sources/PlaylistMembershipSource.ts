import type { CollectionId } from '../../../../common/collections/types';
import type { MembershipSource } from '../types';
import type { PlaylistRepository } from '../../repositories/PlaylistRepository';
import { createCollectionId } from '../../../../common/collections/id';

export class PlaylistMembershipSource implements MembershipSource {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async getCollectionsForSong(songId: number): Promise<readonly CollectionId[]> {
    const playlistIds = await this.repository.getPlaylistsForSong(songId);
    
    const collections = playlistIds.map(id => createCollectionId('local', 'playlist', id));
    Object.freeze(collections);
    
    return collections;
  }

  public async getCollectionsForSongs(
    songIds: readonly number[]
  ): Promise<Map<number, readonly CollectionId[]>> {
    const results = await this.repository.getPlaylistsForSongs(songIds);
    
    const map = new Map<number, CollectionId[]>();
    for (const songId of songIds) {
      map.set(songId, []);
    }
    
    for (const row of results) {
      map.get(row.songId)?.push(createCollectionId('local', 'playlist', row.playlistId));
    }
    
    const finalMap = new Map<number, readonly CollectionId[]>();
    for (const [songId, collections] of map.entries()) {
      Object.freeze(collections);
      finalMap.set(songId, collections);
    }
    
    return finalMap;
  }
}
