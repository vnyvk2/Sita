import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { artistQuery } from '@renderer/queries/artists';
import { usePreviewAudio } from '@renderer/hooks/usePreviewAudio';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import Biography from '@renderer/components/Biography/Biography';
import SimilarArtistsContainer from './SimilarArtistsContainer';

export interface ArtistProfileTabProps {
  artistId: number;
  artistName: string;
  artistData: Artist;
}

export function ArtistProfileTab({ artistId, artistName, artistData }: ArtistProfileTabProps) {
  const { t } = useTranslation();
  const { createQueue, updateQueueData, changePromptMenuData } = useContext(AppUpdateContext);
  const { playPreview, isCurrentTrackPlaying } = usePreviewAudio();

  const { data: profile, isLoading, isError, refetch } = useQuery(
    artistQuery.onlineProfile({ artistId, artistName })
  );

  const handlePlayLocalSong = (songId: number) => {
    createQueue([songId], 'artist', false, artistId, false, artistName);
    updateQueueData(0, undefined, false, true);
  };

  const handleOpenExternalLink = (url: string, name: string) => {
    if (window.api?.utils?.openLink) {
      window.api.utils.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4 py-16 text-center">
        <span className="material-icons-round animate-spin text-4xl text-font-color-highlight dark:text-dark-font-color-highlight">
          progress_activity
        </span>
        <p className="text-sm font-medium opacity-70">
          {t('artistProfile.loadingProfile', 'Loading artist profile...')}
        </p>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4 rounded-2xl bg-background-color-2/30 p-8 text-center backdrop-blur-sm dark:bg-dark-background-color-2/30">
        <span className="material-icons-round text-5xl opacity-40">person_off</span>
        <div className="max-w-md">
          <h3 className="text-lg font-semibold text-font-color-black dark:text-font-color-white">
            {t('artistProfile.noProfileFound', 'Profile unavailable')}
          </h3>
          <p className="mt-1 text-sm text-font-color-dimmed dark:text-font-color-white/60">
            {t(
              'artistProfile.offlineNotice',
              'Unable to fetch online artist information. Check your network connection and try again.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center space-x-2 rounded-full bg-background-color-2 px-5 py-2 text-sm font-medium text-font-color-highlight shadow-sm transition-transform hover:scale-105 dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight"
        >
          <span className="material-icons-round text-lg">refresh</span>
          <span>{t('common.retry', 'Retry')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Popular Tracks Section */}
      {profile.topTracks.length > 0 && (
        <section className="space-y-3 px-2">
          <div className="flex items-center space-x-2">
            <h3 className="text-xl font-bold text-font-color-black dark:text-font-color-white">
              {t('artistProfile.popularTracks', 'Popular Tracks')}
            </h3>
            <span className="text-xs opacity-50 font-normal">
              ({t('artistProfile.globalRank', 'Global Popularity')})
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {profile.topTracks.map((track, index) => {
              const isPlayingThisPreview = isCurrentTrackPlaying(`top-${track.id}`);

              return (
                <div
                  key={track.id || index}
                  className="flex items-center justify-between rounded-xl bg-background-color-2/40 px-3.5 py-2.5 backdrop-blur-sm transition-all hover:bg-background-color-2/70 dark:bg-dark-background-color-2/40 dark:hover:bg-dark-background-color-2/70"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <span className="w-5 text-center font-bold text-sm text-font-color-highlight dark:text-dark-font-color-highlight opacity-70">
                      {index + 1}
                    </span>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-sm font-semibold text-font-color-black dark:text-font-color-white">
                        {track.title}
                      </span>
                      {track.albumTitle && (
                        <span className="truncate text-xs text-font-color-dimmed dark:text-font-color-white/60">
                          {track.albumTitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {track.isInLibrary && track.localSongId ? (
                      <div className="flex items-center space-x-1.5">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                          {t('common.inLibrary', 'In Library')}
                        </span>
                        <button
                          type="button"
                          title={t('common.play')}
                          onClick={() => handlePlayLocalSong(track.localSongId!)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-background-color-2 text-font-color-highlight hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3 transition-transform hover:scale-105"
                        >
                          <span className="material-icons-round text-base">play_arrow</span>
                        </button>
                      </div>
                    ) : track.previewUrl ? (
                      <button
                        type="button"
                        title={isPlayingThisPreview ? t('common.pause') : t('common.play30sPreview', '30s Preview')}
                        onClick={() => playPreview(`top-${track.id}`, track.previewUrl)}
                        className={`flex items-center space-x-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                          isPlayingThisPreview
                            ? 'bg-font-color-highlight text-white dark:bg-dark-font-color-highlight'
                            : 'bg-background-color-2 text-font-color-highlight hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3'
                        }`}
                      >
                        <span className="material-icons-round text-sm">
                          {isPlayingThisPreview ? 'pause' : 'play_arrow'}
                        </span>
                        <span>30s</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Biography Section */}
      {profile.bio && (
        <section className="px-2">
          <Biography
            bioUserName={artistName}
            bio={profile.bio}
            tags={profile.tags}
            hyperlinkData={{
              labelTitle: t('common.readMoreAboutTitle', { title: artistName }),
              label: t('biography.readMoreInLastFm', 'Read more on Last.fm')
            }}
          />
        </section>
      )}

      {/* 3. Similar Artists Section */}
      {profile.similarArtists && (
        <section className="px-2">
          <SimilarArtistsContainer similarArtists={profile.similarArtists} />
        </section>
      )}

      {/* 4. External Discovery Hub Links */}
      {profile.externalLinks.length > 0 && (
        <section className="space-y-3 px-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider opacity-60">
            {t('artistProfile.externalLinks', 'Explore On')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {profile.externalLinks.map((link) => (
              <button
                key={link.name}
                type="button"
                onClick={() => handleOpenExternalLink(link.url, link.name)}
                className="flex items-center space-x-2 rounded-full bg-background-color-2/60 px-4 py-1.5 text-xs font-medium text-font-color-black transition-all hover:bg-background-color-2 hover:scale-105 dark:bg-dark-background-color-2/60 dark:text-font-color-white dark:hover:bg-dark-background-color-2"
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
