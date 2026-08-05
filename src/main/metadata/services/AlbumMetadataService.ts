import type { MetadataCandidate, MatchCriterion, AlbumMetadata } from '../models/RecordingMetadata';

export interface TrackMatchPair {
  localSong: {
    songId: number;
    title: string;
    artist?: string;
    path: string;
    duration?: number;
  };
  remoteTrack: MetadataCandidate;
  confidence: number; // 0.0 to 1.0
  matchedBy: MatchCriterion[];
  reasons: string[];
}

export interface AlbumPreview {
  album: AlbumMetadata;
  trackList: TrackMatchPair[];
  warnings: string[];
  confidence: number;
  changesCount: number;
}

export interface IAlbumMetadataService {
  search(albumName: string, artistName?: string): Promise<AlbumMetadata[]>;
  resolveRelease(releaseId: string): Promise<AlbumMetadata | null>;
  buildAlbumMatch(
    localSongs: Array<{ songId: number; title: string; artist?: string; path: string; duration?: number }>,
    releaseId: string
  ): Promise<AlbumPreview>;
  applyAlbum(preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }>;
}

export class AlbumMetadataService implements IAlbumMetadataService {
  public async search(_albumName: string, _artistName?: string): Promise<AlbumMetadata[]> {
    throw new Error('AlbumMetadataService.search is not implemented yet.');
  }

  public async resolveRelease(_releaseId: string): Promise<AlbumMetadata | null> {
    throw new Error('AlbumMetadataService.resolveRelease is not implemented yet.');
  }

  public async buildAlbumMatch(
    _localSongs: Array<{ songId: number; title: string; artist?: string; path: string; duration?: number }>,
    _releaseId: string
  ): Promise<AlbumPreview> {
    throw new Error('AlbumMetadataService.buildAlbumMatch is not implemented yet.');
  }

  public async applyAlbum(_preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }> {
    throw new Error('AlbumMetadataService.applyAlbum is not implemented yet.');
  }
}
