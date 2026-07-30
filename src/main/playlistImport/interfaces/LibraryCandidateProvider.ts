import type { LibrarySongRecord } from './LibraryLookup';

export interface LibraryCandidateProvider {
  getCandidatesForFilename(filename: string): Promise<LibrarySongRecord[]>;
}
