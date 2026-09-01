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
  const dimensionsDisplay = artworkMetadata?.primaryPath ? 'Local Embedded' : 'Online Release';

  return (
    <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/50 border-background-color-2 dark:border-dark-background-color-2 flex flex-col gap-3.5 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-font-color-black dark:text-font-color-white text-sm font-semibold">
            Cover Artwork Preview
          </span>
          <span className="bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded border px-2 py-0.5 text-xs font-medium">
            {providerDisplay}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleReplaceArtwork(false)}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              !replaceArtwork
                ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black dark:text-font-color-white font-bold'
                : 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white border'
            }`}
          >
            Keep Current
          </button>
          <button
            type="button"
            onClick={() => onToggleReplaceArtwork(true)}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              replaceArtwork
                ? 'bg-font-color-highlight/20 border-font-color-highlight/40 text-font-color-highlight dark:text-dark-font-color-highlight border font-bold'
                : 'bg-background-color-2 dark:bg-dark-background-color-2 border-background-color-3/40 dark:border-dark-background-color-3/40 text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white border'
            }`}
          >
            Replace Artwork
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Current Artwork */}
        <div
          className={`bg-background-color-2/20 dark:bg-dark-background-color-2/30 flex flex-col items-center gap-2 rounded-lg border p-3 ${
            !replaceArtwork
              ? 'border-font-color-highlight dark:border-dark-font-color-highlight'
              : 'border-background-color-2 dark:border-dark-background-color-2'
          }`}
        >
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
            Current Cover
          </span>
          <div className="bg-background-color-2 dark:bg-dark-background-color-2 flex h-[100px] w-[100px] items-center justify-center overflow-hidden rounded-lg">
            {currentArtworkUrl && !currentImgErr ? (
              <img
                src={currentArtworkUrl}
                alt="Current Cover"
                onError={() => setCurrentImgErr(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl opacity-40">🎵</span>
            )}
          </div>
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
            Local Embedded File
          </span>
        </div>

        {/* Suggested Artwork */}
        <div
          className={`bg-background-color-2/20 dark:bg-dark-background-color-2/30 flex flex-col items-center gap-2 rounded-lg border p-3 ${
            replaceArtwork
              ? 'border-font-color-highlight dark:border-dark-font-color-highlight'
              : 'border-background-color-2 dark:border-dark-background-color-2'
          }`}
        >
          <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-xs font-semibold">
            Suggested Cover
          </span>
          <div className="bg-background-color-2 dark:bg-dark-background-color-2 flex h-[100px] w-[100px] items-center justify-center overflow-hidden rounded-lg">
            {suggestedArtworkUrl && !suggestedImgErr ? (
              <img
                src={suggestedArtworkUrl}
                alt="Suggested Cover"
                onError={() => setSuggestedImgErr(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl opacity-40">🎨</span>
            )}
          </div>
          <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-xs">
            {dimensionsDisplay} ({providerDisplay})
          </span>
        </div>
      </div>
    </div>
  );
};
