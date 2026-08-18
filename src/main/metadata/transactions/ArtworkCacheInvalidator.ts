import fs from 'fs';
import path from 'path';

import { resetArtworkCache } from '../../fs/resolveFilePaths';

export class ArtworkCacheInvalidator {
  public invalidateArtworkCache(songArtworksPath?: string, albumArtworksPath?: string): void {
    const safeRemove = (dir?: string) => {
      if (!dir || !fs.existsSync(dir)) return;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          fs.unlinkSync(path.join(dir, file));
        }
      } catch (_err) {
        // Ignore cache cleanup failures
      }
    };

    safeRemove(songArtworksPath);
    safeRemove(albumArtworksPath);

    resetArtworkCache('songArtworks');
    resetArtworkCache('albumArtworks');
  }
}
