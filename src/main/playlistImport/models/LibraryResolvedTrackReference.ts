import type { LibraryMatch } from './LibraryMatch';
import type { ResolvedTrackReference } from './ResolvedTrackReference';

export interface LibraryResolvedTrackReference {
  resolvedTrack: ResolvedTrackReference;
  libraryMatch: LibraryMatch;
}
