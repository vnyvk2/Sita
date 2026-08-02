import type { ResolvedTrackReference } from './ResolvedTrackReference';

export interface ResolvedPlaylistEntry {
  position: number;
  sourceLine?: number;
  resolvedTrack: ResolvedTrackReference;
  dateAdded?: Date;
  comments?: string;
}
