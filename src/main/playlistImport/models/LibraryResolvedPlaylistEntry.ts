import type { LibraryResolvedTrackReference } from './LibraryResolvedTrackReference';

export interface LibraryResolvedPlaylistEntry {
  position: number;
  sourceLine?: number;
  entry: LibraryResolvedTrackReference;
  dateAdded?: Date;
  comments?: string;
}
