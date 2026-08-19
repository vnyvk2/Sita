import React, { useState } from 'react';
import type { ArtworkMetadata } from '../../../../common/metadata/types';

export interface ArtworkPreviewCardProps {
  currentArtworkUrl?: string;
  suggestedArtworkUrl?: string;
  artworkMetadata?: ArtworkMetadata;
  providerName?: string;
  replaceArtwork: boolean;
  onToggleReplaceArtwork: (replace: boolean) => void;
}

const formatProviderDisplayName = (providerId?: string): string => {
  if (!providerId) return 'Online Source';
  switch (providerId.toLowerCase()) {
    case 'musicbrainz':
      return 'MusicBrainz';
    case 'discogs':
      return 'Discogs';
    case 'spotify':
      return 'Spotify';
    case 'lastfm':
      return 'Last.fm';
    default:
      return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  }
};

export const ArtworkPreviewCard: React.FC<ArtworkPreviewCardProps> = ({
  currentArtworkUrl,
  suggestedArtworkUrl,
  artworkMetadata,
  providerName,
  replaceArtwork,
  onToggleReplaceArtwork
}) => {
  const [currentImgErr, setCurrentImgErr] = useState(false);
  const [suggestedImgErr, setSuggestedImgErr] = useState(false);

  const providerDisplay = formatProviderDisplayName(providerName);
  const dimensionsDisplay =
    artworkMetadata?.primaryPath ? 'Local Embedded' : 'Online Release';

  return (
    <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/50 border border-background-color-2 dark:border-dark-background-color-2 rounded-xl p-4 flex flex-col gap-3.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-font-color-black dark:text-font-color-white">
            Cover Artwork Preview
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">
            {providerDisplay}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleReplaceArtwork(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
              !replaceArtwork
                ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black dark:text-font-color-black font-bold'
                : 'bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
            }`}
          >
            Keep Current
          </button>
          <button
            type="button"
            onClick={() => onToggleReplaceArtwork(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
              replaceArtwork
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'bg-background-color-2 dark:bg-dark-background-color-2 border border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
            }`}
          >
            Replace Artwork
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Current Artwork */}
        <div
          className={`flex flex-col items-center gap-2 p-3 bg-background-color-2/20 dark:bg-dark-background-color-2/30 rounded-lg border ${
            !replaceArtwork ? 'border-font-color-highlight dark:border-dark-font-color-highlight' : 'border-background-color-2 dark:border-dark-background-color-2'
          }`}
        >
          <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">Current Cover</span>
          <div className="w-[100px] h-[100px] rounded-lg overflow-hidden bg-background-color-2 dark:bg-dark-background-color-2 flex items-center justify-center">
            {currentArtworkUrl && !currentImgErr ? (
              <img
                src={currentArtworkUrl}
                alt="Current Cover"
                onError={() => setCurrentImgErr(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl opacity-40">🎵</span>
            )}
          </div>
          <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">Local Embedded File</span>
        </div>

        {/* Suggested Artwork */}
        <div
          className={`flex flex-col items-center gap-2 p-3 bg-background-color-2/20 dark:bg-dark-background-color-2/30 rounded-lg border ${
            replaceArtwork ? 'border-emerald-500/50' : 'border-background-color-2 dark:border-dark-background-color-2'
          }`}
        >
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Suggested Cover</span>
          <div className="w-[100px] h-[100px] rounded-lg overflow-hidden bg-background-color-2 dark:bg-dark-background-color-2 flex items-center justify-center">
            {suggestedArtworkUrl && !suggestedImgErr ? (
              <img
                src={suggestedArtworkUrl}
                alt="Suggested Cover"
                onError={() => setSuggestedImgErr(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl opacity-40">🎨</span>
            )}
          </div>
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {dimensionsDisplay} ({providerDisplay})
          </span>
        </div>
      </div>
    </div>
  );
};

