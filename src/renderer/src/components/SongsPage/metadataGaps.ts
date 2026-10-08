export type MetadataGap = 'genre' | 'year' | 'artwork' | 'artist';

export interface MetadataGapInput {
  genres?: { name?: string }[] | null;
  year?: number | null;
  artworkPaths?: { artworkPath?: string | null; optimizedArtworkPath?: string | null } | null;
  artists?: { name?: string }[] | null;
}

/**
 * Pure completeness check over data the song rows already receive. No store subscriptions, no IPC -
 * safe to run per row in the virtualized hot path. Missing album is intentionally NOT a gap
 * (singles without albums are normal).
 */
export function getMetadataGaps(input?: MetadataGapInput | null): MetadataGap[] {
  const gaps: MetadataGap[] = [];

  const hasGenre = (input?.genres ?? []).some((g) => g?.name && g.name.trim().length > 0);
  if (!hasGenre) gaps.push('genre');

  if (input?.year === undefined || input?.year === null || input.year <= 0) gaps.push('year');

  if (!input?.artworkPaths?.artworkPath && !input?.artworkPaths?.optimizedArtworkPath) {
    gaps.push('artwork');
  }

  const hasArtist = (input?.artists ?? []).some((a) => a?.name && a.name.trim().length > 0);
  if (!hasArtist) gaps.push('artist');

  return gaps;
}
