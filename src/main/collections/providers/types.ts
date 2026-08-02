import type { Collection, CollectionEntry, CollectionId } from '../../../common/collections/types';
import type { SortDefinition } from '../query/ast';

export interface CollectionQueryOptions {
  sortType?: string;
  start?: number;
  end?: number;
  filter?: string;
}

export interface EntryQueryOptions {
  start: number;
  end: number;
  sortType?: string;
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
