import type { MetadataCandidate } from '../models/RecordingMetadata';

export interface AlbumReleaseMatch {
  releaseId: string;
  title: string;
  artist: string;
  year?: number;
  label?: string;
  trackCount: number;
  mediaCount: number;
  artworkUrl?: string;
}

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
  matchedBy: string[];
  reasons: string[];
}

export interface AlbumPreview {
  release: AlbumReleaseMatch;
  cover?: string;
  artist: string;
  year?: number;
  label?: string;
  trackList: TrackMatchPair[];
  discCount: number;
  warnings: string[];
  confidence: number;
  changesCount: number;
}

export interface IAlbumMetadataService {
  search(albumName: string, artistName?: string): Promise<AlbumReleaseMatch[]>;
  resolveRelease(releaseId: string): Promise<AlbumReleaseMatch | null>;
  buildAlbumMatch(
    localSongs: Array<{ songId: number; title: string; artist?: string; path: string; duration?: number }>,
    releaseId: string
  ): Promise<AlbumPreview>;
  applyAlbum(preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }>;
}

export class AlbumMetadataService implements IAlbumMetadataService {
  public async search(_albumName: string, _artistName?: string): Promise<AlbumReleaseMatch[]> {
    throw new Error('AlbumMetadataService.search is not implemented yet.');
  }

  public async resolveRelease(_releaseId: string): Promise<AlbumReleaseMatch | null> {
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
