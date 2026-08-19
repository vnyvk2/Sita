import React from 'react';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import { computeFederationSummary } from './utils/previewSummary';

export interface FederationSummaryBarProps {
  preview: AlbumTagPreview;
  artworkSource?: string;
  className?: string;
}

export const FederationSummaryBar: React.FC<FederationSummaryBarProps> = ({
  preview,
  artworkSource,
  className = ''
}) => {
  const summary = computeFederationSummary(preview, artworkSource);

  const getProviderIcon = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case 'musicbrainz':
        return '🌐';
      case 'discogs':
        return '💿';
      case 'coverartarchive':
        return '🎨';
      case 'lrclib':
        return '📝';
      default:
        return '🏷️';
    }
  };

  return (
    <div
      className={`flex items-center flex-wrap gap-2 px-3.5 py-2 rounded-lg bg-background-color-2/40 dark:bg-dark-background-color-2/50 border border-background-color-2 dark:border-dark-background-color-2 text-xs ${className}`}
    >
      <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-semibold flex items-center gap-1">
        <span>Sources:</span>
      </span>

      {summary.providerContributions.map((contrib) => {
        return (
          <div
            key={contrib.providerId}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white font-medium"
          >
            <span>{getProviderIcon(contrib.providerId)}</span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">{contrib.providerName}:</span>
            <span className="font-semibold text-font-color-highlight dark:text-dark-font-color-highlight">{contrib.fieldCount} {contrib.fieldCount === 1 ? 'tag' : 'tags'}</span>
          </div>
        );
      })}

      {summary.artworkProvider && (
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-black dark:text-font-color-white font-medium"
        >
          <span>🎨</span>
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">{summary.artworkProvider}</span>
          <span className="font-semibold text-font-color-highlight dark:text-dark-font-color-highlight">(Artwork)</span>
        </div>
      )}

      {summary.totalChangedFields === 0 && (
        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
          No field modifications detected
        </span>
      )}
    </div>
  );
};

