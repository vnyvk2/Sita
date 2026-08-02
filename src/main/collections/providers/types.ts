import type { Collection, CollectionEntry, CollectionId, PlaylistViewMode } from '../../../common/collections/types';
import type { SortDefinition } from '../query/ast';

export interface CollectionQueryOptions {
  sortType?: PlaylistViewMode | string;
  start?: number;
  end?: number;
  filter?: string;
}

export interface EntryQueryOptions {
  start: number;
  end: number;
  sortType?: PlaylistViewMode;
  sortDefinition?: SortDefinition[];
}

export interface CollectionProvider {
  getCollection(id: CollectionId): Promise<Collection | null>;
  getAllCollections(options: CollectionQueryOptions): Promise<PaginatedResult<Collection, string>>;
  getEntries(
    id: CollectionId,
    options: EntryQueryOptions
  ): Promise<PaginatedResult<CollectionEntry, string>>;
}
