import type { MetadataHealth } from '../domain/MetadataHealth';
import type { MetadataOperationManager } from '../operations/MetadataOperationManager';

export interface SongMetadataInput {
  songId: number;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  artworkBuffer?: Buffer;
  hasArtwork?: boolean;
}

export interface LibraryHealthReport {
  totalSongs: number;
  overallScore: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  missingTitles: number;
  missingArtists: number;
  missingAlbums: number;
  missingArtworks: number;
  missingGenres: number;
  assessedAt: number;
}

export class BackgroundEnrichmentQueue {
  private readonly operationManager?: MetadataOperationManager;
  private readonly pendingJobQueue: number[] = [];

  constructor(operationManager?: MetadataOperationManager) {
    this.operationManager = operationManager;
  }

  public enqueueEnrichment(songId: number): void {
    if (!this.pendingJobQueue.includes(songId)) {
      this.pendingJobQueue.push(songId);
      if (this.operationManager) {
        this.operationManager.createOperation(
          `enrich-${songId}-${Date.now()}`,
          'BackgroundEnrichment',
          [songId],
          'Background'
        );
      }
    }
  }

  public evaluateSongHealth(song: SongMetadataInput): MetadataHealth {
    let score = 100;
    const issues: string[] = [];

    if (!song.title || song.title.trim().length === 0) {
      score -= 30;
      issues.push('Missing song title');
    }

    if (!song.artist || song.artist.trim().length === 0 || song.artist.toLowerCase() === 'unknown artist') {
      score -= 25;
      issues.push('Missing or generic artist');
    }

    if (!song.album || song.album.trim().length === 0 || song.album.toLowerCase() === 'unknown album') {
      score -= 20;
      issues.push('Missing or generic album');
    }

    if (!song.hasArtwork && !song.artworkBuffer) {
      score -= 15;
      issues.push('Missing cover artwork');
    }

    if (!song.genre || song.genre.trim().length === 0) {
      score -= 10;
      issues.push('Missing genre tag');
    }

    const finalScore = Math.max(0, score);
    let rating: MetadataHealth['rating'] = 'Poor';
    if (finalScore >= 90) rating = 'Excellent';
    else if (finalScore >= 75) rating = 'Good';
    else if (finalScore >= 50) rating = 'Fair';

    return {
      resourceId: song.songId,
      resourceType: 'track',
      score: finalScore,
      rating,
      issues,
      assessedAt: Date.now()
    };
  }

  public assessLibraryHealth(songs: SongMetadataInput[]): LibraryHealthReport {
    if (!songs || songs.length === 0) {
      return {
        totalSongs: 0,
        overallScore: 100,
        rating: 'Excellent',
        missingTitles: 0,
        missingArtists: 0,
        missingAlbums: 0,
        missingArtworks: 0,
        missingGenres: 0,
        assessedAt: Date.now()
      };
    }

    let missingTitles = 0;
    let missingArtists = 0;
    let missingAlbums = 0;
    let missingArtworks = 0;
    let missingGenres = 0;
    let scoreSum = 0;

    for (const song of songs) {
      const h = this.evaluateSongHealth(song);
      scoreSum += h.score;

      if (!song.title) missingTitles++;
      if (!song.artist || song.artist.toLowerCase() === 'unknown artist') missingArtists++;
      if (!song.album || song.album.toLowerCase() === 'unknown album') missingAlbums++;
      if (!song.hasArtwork && !song.artworkBuffer) missingArtworks++;
      if (!song.genre) missingGenres++;
    }

    const avgScore = Math.round(scoreSum / songs.length);
    let rating: LibraryHealthReport['rating'] = 'Poor';
    if (avgScore >= 90) rating = 'Excellent';
    else if (avgScore >= 75) rating = 'Good';
    else if (avgScore >= 50) rating = 'Fair';

    return {
      totalSongs: songs.length,
      overallScore: avgScore,
      rating,
      missingTitles,
      missingArtists,
      missingAlbums,
      missingArtworks,
      missingGenres,
      assessedAt: Date.now()
    };
  }

  public get pendingCount(): number {
    return this.pendingJobQueue.length;
  }
}
