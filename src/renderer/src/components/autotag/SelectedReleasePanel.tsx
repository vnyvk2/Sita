import React from 'react';

import { getProviderDisplayName } from '../../../../common/metadata/displayNames';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import type { ArtworkSourceOption } from '../../hooks/useAlbumAutoTag';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FederationSummaryBar } from './FederationSummaryBar';

export interface SelectedReleasePanelProps {
  preview: AlbumTagPreview;
  artworkSource: ArtworkSourceOption;
  replaceArtwork: boolean;
  onArtworkSourceChange: (source: ArtworkSourceOption) => void;
  onToggleReplaceArtwork: (replace: boolean) => void;
}

export const SelectedReleasePanel: React.FC<SelectedReleasePanelProps> = ({
  preview,
  artworkSource,
  replaceArtwork,
  onArtworkSourceChange,
  onToggleReplaceArtwork
}) => {
  const artworkUrl = preview.album.artwork?.primaryPath || preview.album.artwork?.onlineUrls?.[0];
  const mbid =
    preview.resolvedRelease?.releaseGroupId || preview.providerReleaseId || 'mbid-canonical-id';
  const confidencePercent = Math.round(preview.overallConfidence * 100);

  return (
    <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/50 border-background-color-2 dark:border-dark-background-color-2 grid grid-cols-[144px_1fr] items-center gap-4.5 rounded-xl border p-4">
      {/* Left: Artwork & Source Selector */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 relative flex h-[134px] w-[134px] items-center justify-center overflow-hidden rounded-lg border shadow-sm">
          {artworkUrl && artworkSource !== 'local' ? (
            <img
              src={artworkUrl}
              alt="Cover Art"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex flex-col items-center gap-1">
              <span className="text-3xl">🎵</span>
              <span className="text-xs font-medium">No Cover</span>
            </div>
          )}
        </div>

        <label className="text-font-color-black dark:text-font-color-white flex cursor-pointer items-center gap-1.5 text-xs font-medium select-none">
          <input
            type="checkbox"
            checked={replaceArtwork}
            onChange={(e) => onToggleReplaceArtwork(e.target.checked)}
            className="cursor-pointer"
          />
          <span>Update Cover</span>
        </label>
      </div>

      {/* Right: Release Information, Confidence, MBID/ISRC & Artwork Source */}
      <div className="flex flex-col gap-2.5">
        {/* Release Title & Artist */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-xl leading-tight font-bold">
              {preview.album.title}
            </div>
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 text-sm font-medium">
              <span className="text-font-color-black dark:text-font-color-white font-semibold">
                {preview.album.artist}
              </span>{' '}
              {preview.album.year ? `· ${preview.album.year}` : ''} · {preview.matches.length}{' '}
              tracks
            </div>
          </div>

          {/* Confidence Badge */}
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>

        {/* Identity & Metadata Attributes */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2.5 py-0.5 font-medium">
            Provider:{' '}
            <span className="text-font-color-black dark:text-font-color-white font-semibold">
              {getProviderDisplayName(preview.provider)}
            </span>
          </div>

          <div className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2.5 py-0.5 font-medium">
            MBID:{' '}
            <span className="text-font-color-black dark:text-font-color-white font-mono font-semibold">
              {mbid.slice(0, 18)}...
            </span>
          </div>

          <div className="bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/15 border-font-color-highlight/30 dark:border-dark-font-color-highlight/30 text-font-color-highlight dark:text-dark-font-color-highlight rounded border px-2.5 py-0.5 font-semibold">
            Confidence: {confidencePercent}%
          </div>
        </div>

        {/* Dynamic Federation Summary Bar */}
        <FederationSummaryBar
          preview={preview}
          artworkSource={
            replaceArtwork && artworkSource !== 'local'
              ? getProviderDisplayName(artworkSource)
              : undefined
          }
        />

        {/* Artwork Source Radio Group */}
        {replaceArtwork && (
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 flex items-center gap-3.5 text-xs">
            <span className="text-font-color-black dark:text-font-color-white font-semibold">
              Artwork Source:
            </span>
            <label
              className={`flex cursor-pointer items-center gap-1.5 ${artworkSource === 'musicbrainz' ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}
            >
              <input
                type="radio"
                name="artworkSource"
                value="musicbrainz"
                checked={artworkSource === 'musicbrainz'}
                onChange={() => onArtworkSourceChange('musicbrainz')}
              />
              MusicBrainz
            </label>
            <label
              className={`flex cursor-pointer items-center gap-1.5 ${artworkSource === 'coverartarchive' ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}
            >
              <input
                type="radio"
                name="artworkSource"
                value="coverartarchive"
                checked={artworkSource === 'coverartarchive'}
                onChange={() => onArtworkSourceChange('coverartarchive')}
              />
              Cover Art Archive
            </label>
            <label
              className={`flex cursor-pointer items-center gap-1.5 ${artworkSource === 'local' ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}
            >
              <input
                type="radio"
                name="artworkSource"
                value="local"
                checked={artworkSource === 'local'}
                onChange={() => onArtworkSourceChange('local')}
              />
              Keep Existing
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
