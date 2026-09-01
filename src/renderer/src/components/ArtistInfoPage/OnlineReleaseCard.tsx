import Img from '@renderer/components/Img';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnlineReleaseSummary } from 'src/types/artist_discography';

import OnlineTracklist from './OnlineTracklist';

export interface OnlineReleaseCardProps {
  release: OnlineReleaseSummary;
  artistId: number;
  artistName: string;
}

export function OnlineReleaseCard({ release, artistId, artistName }: OnlineReleaseCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const releaseYear = release.releaseDate ? release.releaseDate.split('-')[0] : undefined;

  const renderBadge = () => {
    switch (release.inLibraryStatus) {
      case 'in_library':
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <span className="material-icons-round mr-1 text-sm">check_circle</span>
            {t('common.inLibrary', 'In Library')}
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <span className="material-icons-round mr-1 text-sm">pie_chart</span>
            {release.matchedTrackCount} / {release.trackCount} {t('common.inLibrary', 'in Library')}
          </span>
        );
      case 'discover':
      default:
        return (
          <span className="bg-background-color-2 text-font-color-dimmed dark:bg-dark-background-color-2 dark:text-font-color-white/70 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
            <span className="material-icons-round mr-1 text-sm">explore</span>
            {t('common.discover', 'Discover')}
          </span>
        );
    }
  };

  return (
    <div className="group bg-background-color-2/40 hover:bg-background-color-2/70 dark:bg-dark-background-color-2/40 dark:hover:bg-dark-background-color-2/70 relative flex flex-col rounded-2xl p-4 backdrop-blur-sm transition-all duration-200">
      <div className="flex space-x-4">
        {/* Cover Artwork */}
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl shadow-md">
          <Img
            src={release.coverMedium}
            fallbackSrc=""
            alt={release.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {release.explicitLyrics && (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white uppercase backdrop-blur-sm">
              E
            </span>
          )}
        </div>

        {/* Release Metadata */}
        <div className="flex flex-1 flex-col justify-between overflow-hidden">
          <div>
            <div className="mb-1 flex items-center justify-between">
              {renderBadge()}
              {releaseYear && <span className="text-xs opacity-60">{releaseYear}</span>}
            </div>

            <h4
              className="text-font-color-black dark:text-font-color-white line-clamp-1 text-base font-semibold"
              title={release.title}
            >
              {release.title}
            </h4>

            <p className="text-font-color-dimmed dark:text-font-color-white/60 text-xs">
              {release.trackCount}{' '}
              {release.trackCount === 1 ? t('common.track', 'track') : t('common.tracks', 'tracks')}
            </p>
          </div>

          {/* Action Toggle */}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-font-color-highlight dark:text-dark-font-color-highlight flex items-center text-xs font-medium hover:underline"
            >
              <span>
                {isExpanded
                  ? t('common.hideTracks', 'Hide Tracks')
                  : t('common.viewTracks', 'View Tracks & Previews')}
              </span>
              <span className="material-icons-round ml-1 text-base transition-transform duration-200">
                {isExpanded ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Tracklist Drawer */}
      {isExpanded && (
        <OnlineTracklist onlineAlbumId={release.id} artistId={artistId} artistName={artistName} />
      )}
    </div>
  );
}

export default OnlineReleaseCard;
