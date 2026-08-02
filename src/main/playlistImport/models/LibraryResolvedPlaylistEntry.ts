import type { LibraryResolvedTrackReference } from './LibraryResolvedTrackReference';

export interface LibraryResolvedPlaylistEntry {
  position: number;
  sourceLine?: number;
  trackReference: LibraryResolvedTrackReference;
  dateAdded?: Date;
  comments?: string;
}
