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
    return acc + m.fieldDiffs.filter((d) => d.applyField && (d.status === 'changed' || d.status === 'new')).length;
  }, 0);

  const totalWarnings = selectedMatches.reduce((acc, m) => acc + (m.warningCount ?? 0), 0);

  return (
    <div className="bg-background-color-2/40 border border-background-color-2 rounded-xl p-5 flex flex-col gap-3.5 text-font-color">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-bold text-font-color">Pre-Apply Summary</span>
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>
        <div className="flex items-center gap-2">
          {preview.contributingProviders && preview.contributingProviders.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-font-color-dimmed">Federated:</span>
              {preview.contributingProviders.map((pId) => (
                <span
                  key={pId}
                  className="px-2 py-0.5 rounded bg-background-color-2 border border-background-color-3/40 text-font-color-dimmed text-xs font-medium"
                >
                  {pId === 'musicbrainz' ? 'MusicBrainz' : pId === 'discogs' ? 'Discogs' : pId === 'coverartarchive' ? 'Cover Art Archive' : pId}
                </span>
              ))}
            </div>
          )}
          <div className="text-xs text-font-color-highlight font-semibold">
            {selectedMatches.length} Tracks ({totalFieldChanges} Field Changes)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-background-color-2/30 p-3 rounded-lg border border-background-color-2">
          <div className="text-xs text-font-color-dimmed font-medium">Titles Changed</div>
          <div className="text-xl font-bold text-font-color-highlight mt-1">{titlesChanged}</div>
        </div>

        <div className="bg-background-color-2/30 p-3 rounded-lg border border-background-color-2">
          <div className="text-xs text-font-color-dimmed font-medium">Artists Changed</div>
          <div className="text-xl font-bold text-font-color mt-1">{artistsChanged}</div>
        </div>

        <div className="bg-background-color-2/30 p-3 rounded-lg border border-background-color-2">
          <div className="text-xs text-font-color-dimmed font-medium">Years Updated</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{yearsChanged}</div>
        </div>

        <div className="bg-background-color-2/30 p-3 rounded-lg border border-background-color-2">
          <div className="text-xs text-font-color-dimmed font-medium">Cover Artwork</div>
          <div className={`text-sm font-semibold mt-1 ${replaceArtwork ? 'text-emerald-600 dark:text-emerald-400' : 'text-font-color-dimmed'}`}>
            {replaceArtwork ? 'Replace' : 'Keep Current'}
          </div>
        </div>
      </div>

      {totalWarnings > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium">
          ⚠️ {totalWarnings} track warning(s) detected. Please review highlighted differences before proceeding.
        </div>
      )}
    </div>
  );
};

