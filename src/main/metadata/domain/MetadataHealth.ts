import type { TrackResourceAttributes } from './MetadataResource';

export interface MetadataHealthScore {
  score: number; // 0 to 100
  rating: 'Poor' | 'Fair' | 'Good' | 'Excellent';
  issues: string[];
}

export class MetadataHealthEvaluator {
  /**
   * Evaluates the health quality of a track metadata resource.
   */
  public static evaluateTrackHealth(track: TrackResourceAttributes): MetadataHealthScore {
    let score = 100;
    const issues: string[] = [];

    if (!track.title || track.title.toLowerCase().startsWith('track')) {
      score -= 25;
      issues.push('Missing or unformatted title');
    }

    if (!track.artist || track.artist.toLowerCase() === 'unknown artist') {
      score -= 25;
      issues.push('Missing or generic artist');
    }

    if (!track.album) {
      score -= 15;
      issues.push('Missing album name');
    }

    if (!track.artworkPath) {
      score -= 15;
      issues.push('Missing cover artwork');
    }

    if (!track.year) {
      score -= 10;
      issues.push('Missing release year');
    }

    if (!track.genre) {
      score -= 10;
      issues.push('Missing genre classification');
    }

    const clampedScore = Math.max(0, Math.min(100, score));

    let rating: MetadataHealthScore['rating'] = 'Excellent';
    if (clampedScore < 50) rating = 'Poor';
    else if (clampedScore < 75) rating = 'Fair';
    else if (clampedScore < 90) rating = 'Good';

    return {
      score: clampedScore,
      rating,
      issues
    };
  }
}
