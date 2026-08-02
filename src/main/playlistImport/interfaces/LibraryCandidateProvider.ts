import type { LibrarySongRecord } from './LibraryLookup';

export interface LibraryCandidateProvider {
  getCandidatesForFilename(filename: string): Promise<LibrarySongRecord[]>;
  getCandidatesForFilenames?(filenames: string[]): Promise<Map<string, LibrarySongRecord[]>>;
}
