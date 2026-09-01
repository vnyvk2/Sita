import React from 'react';

import type { AlbumTagPreview, TrackMatchPreview } from '../../../../common/metadata/types';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface FinalReviewSummaryCardProps {
  preview: AlbumTagPreview;
  selectedMatches: TrackMatchPreview[];
  replaceArtwork: boolean;
}

export const FinalReviewSummaryCard: React.FC<FinalReviewSummaryCardProps> = ({
  preview,
  selectedMatches,
  replaceArtwork
}) => {
  const titlesChanged = selectedMatches.filter((m) =>
    m.fieldDiffs.some((d) => d.fieldId === 'title' && d.applyField && d.status === 'changed')
  ).length;

  const artistsChanged = selectedMatches.filter((m) =>
    m.fieldDiffs.some((d) => d.fieldId === 'artist' && d.applyField && d.status === 'changed')
  ).length;

  const yearsChanged = selectedMatches.filter((m) =>
    m.fieldDiffs.some((d) => d.fieldId === 'year' && d.applyField && d.status === 'changed')
  ).length;

  const totalFieldChanges = selectedMatches.reduce((acc, m) => {
    return (
      acc +
      m.fieldDiffs.filter((d) => d.applyField && (d.status === 'changed' || d.status === 'new'))
        .length
    );
  }, 0);

  const totalWarnings = selectedMatches.reduce((acc, m) => acc + (m.warningCount ?? 0), 0);

  return (
    <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/50 border-background-color-2 dark:border-dark-background-color-2 text-font-color-black dark:text-font-color-white flex flex-col gap-3.5 rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-font-color-black dark:text-font-color-white text-base font-bold">
            Pre-Apply Summary
          </span>
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>
        <div className="flex items-center gap-2">
          {preview.contributingProviders && preview.contributingProviders.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
                Federated:
              </span>
              {preview.contributingProviders.map((pId) => (
                <span
                  key={pId}
                  className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2 py-0.5 text-xs font-medium"
                >
                  {pId === 'musicbrainz'
                    ? 'MusicBrainz'
                    : pId === 'discogs'
                      ? 'Discogs'
                      : pId === 'coverartarchive'
                        ? 'Cover Art Archive'
                        : pId}
                </span>
              ))}
            </div>
          )}
          <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-xs font-semibold">
            {selectedMatches.length} Tracks ({totalFieldChanges} Field Changes)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-background-color-2 dark:border-dark-background-color-2 rounded-lg border p-3">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
            Titles Changed
          </div>
          <div className="text-font-color-highlight dark:text-dark-font-color-highlight mt-1 text-xl font-bold">
            {titlesChanged}
          </div>
        </div>

        <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-background-color-2 dark:border-dark-background-color-2 rounded-lg border p-3">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
            Artists Changed
          </div>
          <div className="text-font-color-black dark:text-font-color-white mt-1 text-xl font-bold">
            {artistsChanged}
          </div>
        </div>

        <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-background-color-2 dark:border-dark-background-color-2 rounded-lg border p-3">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
            Years Updated
          </div>
          <div className="text-font-color-highlight dark:text-dark-font-color-highlight mt-1 text-xl font-bold">
            {yearsChanged}
          </div>
        </div>

        <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/40 border-background-color-2 dark:border-dark-background-color-2 rounded-lg border p-3">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
            Cover Artwork
          </div>
          <div
            className={`mt-1 text-sm font-semibold ${replaceArtwork ? 'text-font-color-highlight dark:text-dark-font-color-highlight' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}
          >
            {replaceArtwork ? 'Replace' : 'Keep Current'}
          </div>
        </div>
      </div>

      {totalWarnings > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/15 p-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          ⚠️ {totalWarnings} track warning(s) detected. Please review highlighted differences before
          proceeding.
        </div>
      )}
    </div>
  );
};
