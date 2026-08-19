import type { AlbumTagPreview, MetadataFieldDiff, TrackMatchPreview } from '../../../../common/metadata/types';

export interface ProviderContribution {
  providerId: string;
  providerName: string;
  fieldCount: number;
}

export interface FederationSummaryData {
  totalChangedFields: number;
  providerContributions: ProviderContribution[];
  artworkProvider?: string;
}

/**
 * Returns true if a field diff represents an actual semantic change (new or modified value).
 */
export function isFieldChanged(diff: MetadataFieldDiff): boolean {
  return diff.status === 'changed' || diff.status === 'new';
}

/**
 * Filters a track's field diffs down to only those that represent actual changes.
 */
export function getChangedFieldDiffs(track: TrackMatchPreview): MetadataFieldDiff[] {
  return track.fieldDiffs.filter(isFieldChanged);
}

/**
 * Calculates the total number of changed/new fields for a single track.
 */
export function getTrackChangeCount(track: TrackMatchPreview): number {
  return getChangedFieldDiffs(track).length;
}

/**
 * Calculates data-driven provider contributions derived directly from the preview's fieldDiffs.
 * Each changed/new field is attributed to the provider that supplied the winning/suggested value.
 */
export function computeFederationSummary(
  preview: AlbumTagPreview,
  artworkSource?: string
): FederationSummaryData {
  const providerMap = new Map<string, { name: string; count: number }>();
  let totalChangedFields = 0;

  for (const match of preview.matches) {
    for (const diff of match.fieldDiffs) {
      if (isFieldChanged(diff)) {
        totalChangedFields++;
        const pId = diff.providerId || preview.provider || 'unknown';
        const pName = diff.providerName || (pId === 'musicbrainz' ? 'MusicBrainz' : pId === 'discogs' ? 'Discogs' : pId);

        const current = providerMap.get(pId) || { name: pName, count: 0 };
        current.count++;
        providerMap.set(pId, current);
      }
    }
  }

  const providerContributions: ProviderContribution[] = Array.from(providerMap.entries()).map(
    ([providerId, data]) => ({
      providerId,
      providerName: data.name,
      fieldCount: data.count
    })
  );

  // Sort providers by contribution count descending
  providerContributions.sort((a, b) => b.fieldCount - a.fieldCount);

  return {
    totalChangedFields,
    providerContributions,
    artworkProvider: artworkSource || preview.album.coverArtUrl ? 'Cover Art Archive' : undefined
  };
}

/**
 * Determines whether the active HTML element is an interactive input control
 * where global keybindings (like Space or Enter) should NOT trigger dialog actions.
 */
export function isInteractiveElement(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (element.isContentEditable) {
    return true;
  }

  return false;
}
