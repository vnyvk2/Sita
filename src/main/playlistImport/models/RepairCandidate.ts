import type { LibrarySongRecord } from '../interfaces/LibraryLookup';

export interface RepairCandidate {
  song: LibrarySongRecord;
  confidence: number;
  strategyName: string;
  reason: string;
}
