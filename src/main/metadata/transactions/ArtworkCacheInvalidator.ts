import { resetArtworkCache } from '../../fs/resolveFilePaths';

export class ArtworkCacheInvalidator {
  /**
   * Invalidates artwork caches by bumping URL timestamp query parameters.
   * Invariant: Must NEVER delete or unlink physical artwork files from disk.
   */
  public invalidateArtworkCache(_songArtworksPath?: string, _albumArtworksPath?: string): void {
    resetArtworkCache('songArtworks');
    resetArtworkCache('albumArtworks');
  }
}
