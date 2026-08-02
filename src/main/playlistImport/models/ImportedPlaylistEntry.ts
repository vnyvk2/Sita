import type { ImportedTrackReference } from './ImportedTrackReference';

export interface ImportedPlaylistEntry {
  /** 1-based original position in the imported playlist file (distinct from DB order). */
  position: number;
  /** 1-based line number in the source file where this entry occurred. */
  sourceLine?: number;
  track: ImportedTrackReference;
  dateAdded?: Date;
  comments?: string;
}
