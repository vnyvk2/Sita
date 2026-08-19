import React from 'react';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import { getProviderDisplayName } from '../../../../common/metadata/displayNames';
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
  const mbid = preview.resolvedRelease?.releaseGroupId || preview.providerReleaseId || 'mbid-canonical-id';
  const confidencePercent = Math.round(preview.overallConfidence * 100);

  return (
    <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/50 rounded-xl border border-background-color-2 dark:border-dark-background-color-2 p-5 grid grid-cols-[130px_1fr] gap-5 items-center">
      {/* Left: Artwork & Source Selector */}
      <div className="flex flex-col gap-2 items-center">
        <div className="w-[110px] h-[110px] rounded-lg overflow-hidden bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 flex items-center justify-center relative shadow-sm">
          {artworkUrl && artworkSource !== 'local' ? (
            <img
              src={artworkUrl}
              alt="Cover Art"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-font-color-dimmed dark:text-dark-font-color-dimmed">
              <span className="text-2xl">🎵</span>
              <span className="text-xs font-medium">No Cover</span>
            </div>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-font-color-black dark:text-font-color-white font-medium cursor-pointer">
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
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xl font-bold text-font-color-highlight dark:text-dark-font-color-highlight leading-tight">
              {preview.album.title}
            </div>
            <div className="text-sm text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 font-medium">
              <span className="text-font-color-black dark:text-font-color-white font-semibold">{preview.album.artist}</span> {preview.album.year ? `· ${preview.album.year}` : ''} · {preview.matches.length} tracks
            </div>
          </div>

          {/* Confidence Badge */}
          <ConfidenceBadge level={preview.confidenceLevel} confidence={preview.overallConfidence} />
        </div>

        {/* Identity & Metadata Attributes */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <div className="bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 rounded px-2.5 py-0.5 text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">
            Provider: <span className="text-font-color-black dark:text-font-color-white font-semibold">{getProviderDisplayName(preview.provider)}</span>
          </div>

          <div className="bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 rounded px-2.5 py-0.5 text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">
            MBID: <span className="font-mono text-font-color-black dark:text-font-color-white font-semibold">{mbid.slice(0, 18)}...</span>
          </div>

          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded px-2.5 py-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
            Confidence: {confidencePercent}%
          </div>
        </div>

        {/* Dynamic Federation Summary Bar */}
        <FederationSummaryBar
          preview={preview}
          artworkSource={replaceArtwork && artworkSource !== 'local' ? getProviderDisplayName(artworkSource) : undefined}
        />

        {/* Artwork Source Radio Group */}
        {replaceArtwork && (
          <div className="flex items-center gap-3.5 mt-0.5 text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
            <span className="font-semibold text-font-color-black dark:text-font-color-white">Artwork Source:</span>
            <label className={`flex items-center gap-1.5 cursor-pointer ${artworkSource === 'musicbrainz' ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}>
              <input
                type="radio"
                name="artworkSource"
                value="musicbrainz"
                checked={artworkSource === 'musicbrainz'}
                onChange={() => onArtworkSourceChange('musicbrainz')}
              />
              MusicBrainz
            </label>
            <label className={`flex items-center gap-1.5 cursor-pointer ${artworkSource === 'coverartarchive' ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}>
              <input
                type="radio"
                name="artworkSource"
                value="coverartarchive"
                checked={artworkSource === 'coverartarchive'}
                onChange={() => onArtworkSourceChange('coverartarchive')}
              />
              Cover Art Archive
            </label>
            <label className={`flex items-center gap-1.5 cursor-pointer ${artworkSource === 'local' ? 'text-font-color-black dark:text-font-color-white font-semibold' : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'}`}>
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

