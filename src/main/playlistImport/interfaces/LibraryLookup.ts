export interface LibrarySongRecord {
  id: number;
  path: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface LibraryLookup {
  findByCanonicalPath(path: string): Promise<LibrarySongRecord | null>;
  findManyByCanonicalPaths?(paths: string[]): Promise<Map<string, LibrarySongRecord>>;
  findByFilename?(filename: string): Promise<LibrarySongRecord[]>;
}
