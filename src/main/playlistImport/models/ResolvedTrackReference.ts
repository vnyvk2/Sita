import type { ImportedTrackReference } from './ImportedTrackReference';
import type { PathResolutionResult } from './PathResolutionResult';

export interface ResolvedTrackReference {
  track: ImportedTrackReference;
  resolution: PathResolutionResult;
}
