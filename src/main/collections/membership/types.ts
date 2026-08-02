import type { CollectionId } from '../../../common/collections/types';

export interface CollectionMembership {
  collectionId: CollectionId;
  songId: number;
}

export interface BatchMembership {
  collections: {
    collectionId: CollectionId;
    membershipState: 'all' | 'some' | 'none';
  }[];
}


export interface MembershipSource {
  getCollectionsForSong(songId: number): Promise<readonly CollectionId[]>;
  
  getCollectionsForSongs?(
    songIds: readonly number[]
  ): Promise<Map<number, readonly CollectionId[]>>;
}
