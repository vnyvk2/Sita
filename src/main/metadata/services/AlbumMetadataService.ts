import type { MetadataCandidate, RecordingMetadata } from '../models/RecordingMetadata';

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
  public async search(albumName: string, artistName?: string): Promise<AlbumReleaseMatch[]> {
    // Pipeline stub: delegates search to MetadataProviderRuntime
    return [
      {
        releaseId: 'mb-stub-1',
        title: albumName,
        artist: artistName ?? 'Unknown Artist',
        trackCount: 10,
        mediaCount: 1
      }
    ];
  }

  public async resolveRelease(releaseId: string): Promise<AlbumReleaseMatch | null> {
    return {
      releaseId,
      title: 'Resolved Release',
      artist: 'Artist',
      trackCount: 10,
      mediaCount: 1
    };
  }

  public async buildAlbumMatch(
    localSongs: Array<{ songId: number; title: string; artist?: string; path: string; duration?: number }>,
    releaseId: string
  ): Promise<AlbumPreview> {
    const release = await this.resolveRelease(releaseId);
    const trackList: TrackMatchPair[] = localSongs.map((song, index) => {
      const recording: RecordingMetadata = {
        title: song.title,
        artist: song.artist,
        trackNumber: index + 1
      };
      const candidate: MetadataCandidate = {
        recording,
        provider: {
          provider: 'musicbrainz',
          providerReleaseId: releaseId,
          confidence: 0.95,
          matchedBy: ['title', 'index'],
          reasons: ['exact_index_match']
        }
      };
      return {
        localSong: song,
        remoteTrack: candidate,
        confidence: 0.95,
        matchedBy: ['title', 'index'],
        reasons: ['exact_index_match']
      };
    });

    return {
      release: release!,
      artist: release?.artist ?? '',
      year: release?.year,
      trackList,
      discCount: release?.mediaCount ?? 1,
      warnings: [],
      confidence: 0.95,
      changesCount: trackList.length
    };
  }

  public async applyAlbum(preview: AlbumPreview): Promise<{ success: boolean; updatedSongCount: number }> {
    return {
      success: true,
      updatedSongCount: preview.trackList.length
    };
  }
}
