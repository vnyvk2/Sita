import defaultArtistCover from '@renderer/assets/images/webp/artist_cover_default.webp';
import HashTag from '@renderer/components/Biography/HashTag';
import Img from '@renderer/components/Img';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { usePreviewAudio } from '@renderer/hooks/usePreviewAudio';
import { artistQuery } from '@renderer/queries/artists';
import { useQuery } from '@tanstack/react-query';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ArtistBioModal from './ArtistBioModal';
import SimilarArtistsContainer from './SimilarArtistsContainer';

export interface ArtistProfileTabProps {
  artistId: number;
  artistName: string;
  artistData: Artist;
}

function formatTrackDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function ArtistProfileTab({ artistId, artistName, artistData }: ArtistProfileTabProps) {
  const { t } = useTranslation();
  const { createQueue, updateQueueData, changePromptMenuData } = useContext(AppUpdateContext);
  const { playPreview, isCurrentTrackPlaying } = usePreviewAudio();
  const [imgLoadError, setImgLoadError] = useState(false);

  const {
    data: profile,
    isLoading,
    isError,
    refetch
  } = useQuery(artistQuery.onlineProfile({ artistId, artistName }));

  const handlePlayLocalSong = (songId: number) => {
    createQueue([songId], 'artist', false, artistId, false, artistName);
    updateQueueData(0, undefined, false, true);
  };

  const handleOpenExternalLink = (url: string) => {
    if (window.api?.utils?.openLink) {
      window.api.utils.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleOpenBioModal = () => {
    if (!profile) return;
    changePromptMenuData(
      true,
      <ArtistBioModal
        artistName={artistName}
        bioParagraphs={
          profile.bioParagraphs && profile.bioParagraphs.length > 0
            ? profile.bioParagraphs
            : [profile.bioSummary || profile.bioFull || '']
        }
        bioSource={profile.bioSource}
        bioUrl={profile.bioUrl}
        tags={profile.tags}
      />,
      'artist-bio-modal'
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[350px] flex-col items-center justify-center space-y-4 py-16 text-center">
        <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight animate-spin text-4xl">
          progress_activity
        </span>
        <p className="text-sm font-medium opacity-70">
          {t('artistProfile.loadingProfile', 'Loading artist profile & biography...')}
        </p>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 flex min-h-[320px] flex-col items-center justify-center space-y-4 rounded-2xl p-8 text-center backdrop-blur-sm">
        <span className="material-icons-round text-5xl opacity-40">person_off</span>
        <div className="max-w-md">
          <h3 className="text-font-color-black dark:text-font-color-white text-lg font-semibold">
            {t('artistProfile.noProfileFound', 'Profile unavailable')}
          </h3>
          <p className="text-font-color-dimmed dark:text-font-color-white/60 mt-1 text-sm">
            {t(
              'artistProfile.offlineNotice',
              'Unable to fetch online artist information. Check your network connection and try again.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="bg-background-color-2 text-font-color-highlight dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight flex items-center space-x-2 rounded-full px-5 py-2 text-sm font-medium shadow-sm transition-transform hover:scale-105"
        >
          <span className="material-icons-round text-lg">refresh</span>
          <span>{t('common.retry', 'Retry')}</span>
        </button>
      </div>
    );
  }

  const featuredImgUrl =
    (!imgLoadError && profile.featuredImage?.url) ||
    artistData?.onlineArtworkPaths?.picture_xl ||
    artistData?.onlineArtworkPaths?.picture_medium ||
    artistData?.artworkPaths?.artworkPath ||
    defaultArtistCover;

  return (
    <div className="space-y-8 pb-12">
      {/* 1. MusicBee-Style Hero / Biography Card */}
      <section className="border-background-color-2/60 bg-background-color-2/40 dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/40 rounded-2xl border p-6 shadow-lg backdrop-blur-md">
        <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
          {/* Left: Featured Artist Artwork */}
          <div className="group bg-background-color-1 dark:bg-dark-background-color-1 relative h-56 w-56 shrink-0 self-center overflow-hidden rounded-xl shadow-md md:self-start">
            <Img
              src={featuredImgUrl}
              fallbackSrc={defaultArtistCover}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              alt={artistName}
              loading="eager"
              onError={() => setImgLoadError(true)}
            />
            {profile.featuredImage?.source && (
              <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                {profile.featuredImage.source}
              </div>
            )}
          </div>

          {/* Right: Artist Biography & Metadata Snippet */}
          <div className="flex flex-1 flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-font-color-highlight dark:text-dark-font-color-highlight text-3xl font-extrabold">
                  {artistName}
                </h2>
                {profile.bioSource && (
                  <span
                    className={`flex items-center space-x-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      profile.bioSource === 'Wikipedia'
                        ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                        : 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    }`}
                  >
                    <span className="material-icons-round text-xs">
                      {profile.bioSource === 'Wikipedia' ? 'menu_book' : 'public'}
                    </span>
                    <span>{profile.bioSource}</span>
                  </span>
                )}
              </div>

              {/* Tags / Genres */}
              {profile.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.tags.slice(0, 5).map((tag) => (
                    <HashTag key={tag.url || tag.name} {...tag} />
                  ))}
                </div>
              )}

              {/* Bio Summary Snippet */}
              <p className="text-font-color-black/80 dark:text-font-color-white/80 line-clamp-4 text-sm leading-relaxed">
                {profile.bioSummary || profile.bioFull || (
                  <span className="italic opacity-60">
                    {t('biography.noBioSummary', 'No detailed biography snippet available.')}
                  </span>
                )}
              </p>
            </div>

            {/* Read More Action Button */}
            {(profile.bioParagraphs.length > 0 || profile.bioSummary) && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenBioModal}
                  className="bg-background-color-2 text-font-color-highlight hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3 inline-flex items-center space-x-2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm transition-all hover:scale-105"
                >
                  <span className="material-icons-round text-sm">article</span>
                  <span>{t('biography.readMore', 'Read Full Biography →')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. MusicBee-Style Top Tracks List */}
      {profile.topTracks.length > 0 && (
        <section className="space-y-4 px-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-font-color-black dark:text-font-color-white text-xl font-bold">
                {t('artistProfile.popularTracks', 'Top Tracks')}
              </h3>
              <span className="text-xs font-normal opacity-60">
                ({t('artistProfile.globalRank', 'Global Popularity #1 - #10')})
              </span>
            </div>
          </div>

          <div className="border-background-color-2/50 bg-background-color-2/20 dark:border-dark-background-color-2/50 dark:bg-dark-background-color-2/20 overflow-hidden rounded-xl border backdrop-blur-sm">
            <div className="divide-background-color-2/40 dark:divide-dark-background-color-2/40 divide-y">
              {profile.topTracks.map((track) => {
                const isPlayingThisPreview = isCurrentTrackPlaying(`top-${track.id}`);

                return (
                  <div
                    key={track.id}
                    className="hover:bg-background-color-2/60 dark:hover:bg-dark-background-color-2/60 flex items-center justify-between px-4 py-3 transition-colors"
                  >
                    {/* Rank & Title Info */}
                    <div className="flex min-w-0 flex-1 items-center space-x-4 pr-4">
                      <span className="text-font-color-highlight dark:text-dark-font-color-highlight w-6 text-center text-sm font-bold opacity-80">
                        #{track.globalRank}
                      </span>

                      {track.coverMedium && (
                        <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-10 w-10 shrink-0 overflow-hidden rounded-md">
                          <img
                            src={track.coverMedium}
                            alt={track.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}

                      <div className="flex min-w-0 flex-col">
                        <span className="text-font-color-black dark:text-font-color-white truncate text-sm font-semibold">
                          {track.title}
                        </span>
                        {track.albumTitle && (
                          <span className="text-font-color-dimmed dark:text-font-color-white/60 truncate text-xs">
                            {track.albumTitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Duration & Playback Actions */}
                    <div className="flex shrink-0 items-center space-x-3">
                      <span className="text-font-color-dimmed dark:text-font-color-white/60 text-xs tabular-nums">
                        {formatTrackDuration(track.durationSec)}
                      </span>

                      {track.isInLibrary && track.localSongId ? (
                        <div className="flex items-center space-x-2">
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                            {t('common.inLibrary', 'In Library')}
                          </span>
                          <button
                            type="button"
                            title={t('common.playLocalSong', 'Play from Library')}
                            onClick={() => handlePlayLocalSong(track.localSongId!)}
                            className="bg-font-color-highlight dark:bg-dark-font-color-highlight flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-110"
                          >
                            <span className="material-icons-round text-base">play_arrow</span>
                          </button>
                        </div>
                      ) : track.previewUrl ? (
                        <button
                          type="button"
                          title={
                            isPlayingThisPreview
                              ? t('common.pausePreview', 'Pause Preview')
                              : t('common.play30sPreview', 'Play 30s Preview')
                          }
                          onClick={() => playPreview(`top-${track.id}`, track.previewUrl)}
                          className={`flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                            isPlayingThisPreview
                              ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-md'
                              : 'bg-background-color-2 text-font-color-highlight hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3'
                          }`}
                        >
                          <span className="material-icons-round text-sm">
                            {isPlayingThisPreview ? 'pause' : 'play_arrow'}
                          </span>
                          <span>{t('common.preview30s', '30s Preview')}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 3. Similar Artists Section */}
      {profile.similarArtists && (
        <section className="px-2">
          <SimilarArtistsContainer similarArtists={profile.similarArtists} />
        </section>
      )}

      {/* 4. External Discovery Links */}
      {profile.externalLinks.length > 0 && (
        <section className="space-y-3 px-4">
          <h4 className="text-font-color-dimmed dark:text-font-color-white/60 text-xs font-bold tracking-wider uppercase">
            {t('artistProfile.externalLinks', 'Explore On Web')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {profile.externalLinks.map((link) => (
              <button
                key={link.name}
                type="button"
                onClick={() => handleOpenExternalLink(link.url)}
                className="bg-background-color-2/60 text-font-color-black hover:bg-background-color-2 dark:bg-dark-background-color-2/60 dark:text-font-color-white dark:hover:bg-dark-background-color-2 flex items-center space-x-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all hover:scale-105"
              >
                <span className="material-icons-round text-sm opacity-70">{link.icon}</span>
                <span>{link.name}</span>
                <span className="material-icons-round text-xs opacity-40">open_in_new</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default ArtistProfileTab;
