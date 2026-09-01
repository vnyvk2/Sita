import type { LibraryMatch } from '../../playlistImport/models/LibraryMatch';

export interface MatchProvider {
  name: string;
  findLibraryMatch(
    filename: string,
    metadata?: Record<string, string>
  ): Promise<LibraryMatch | null>;
}
