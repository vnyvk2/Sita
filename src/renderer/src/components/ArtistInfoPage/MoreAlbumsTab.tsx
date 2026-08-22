import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { artistQuery } from '@renderer/queries/artists';
import type { InLibraryStatus, OnlineReleaseSummary } from 'src/types/artist_discography';
import OnlineReleaseCard from './OnlineReleaseCard';

export interface MoreAlbumsTabProps {
  artistId: number;
  artistName: string;
}

type FilterOption = 'all' | 'in_library' | 'discover';

export function MoreAlbumsTab({ artistId, artistName }: MoreAlbumsTabProps) {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');

  const { data: discography, isLoading, isError, refetch } = useQuery(
    artistQuery.discography({ artistId, artistName })
  );

  const filterReleases = (releases: OnlineReleaseSummary[]) => {
    if (activeFilter === 'all') return releases;
    if (activeFilter === 'in_library') {
      return releases.filter((r) => r.inLibraryStatus === 'in_library' || r.inLibraryStatus === 'partial');
    }
    if (activeFilter === 'discover') {
      return releases.filter((r) => r.inLibraryStatus === 'discover');
    }
    return releases;
  };

  const filteredAlbums = useMemo(
    () => filterReleases(discography?.albums || []),
    [discography?.albums, activeFilter]
  );

  const filteredSingles = useMemo(
    () => filterReleases(discography?.singlesAndEPs || []),
    [discography?.singlesAndEPs, activeFilter]
  );

  const filteredCompilations = useMemo(
    () => filterReleases(discography?.compilationsAndLive || []),
    [discography?.compilationsAndLive, activeFilter]
  );

  const totalFilteredCount =
    filteredAlbums.length + filteredSingles.length + filteredCompilations.length;

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4 py-16 text-center">
        <span className="material-icons-round animate-spin text-4xl text-font-color-highlight dark:text-dark-font-color-highlight">
          progress_activity
        </span>
        <p className="text-sm font-medium opacity-70">
          {t('moreAlbums.loadingDiscography', 'Discovering artist releases...')}
        </p>
      </div>
    );
  }

  if (isError || !discography || discography.totalOnlineReleases === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4 rounded-2xl bg-background-color-2/30 p-8 text-center backdrop-blur-sm dark:bg-dark-background-color-2/30">
        <span className="material-icons-round text-5xl opacity-40">cloud_off</span>
        <div className="max-w-md">
          <h3 className="text-lg font-semibold text-font-color-black dark:text-font-color-white">
            {t('moreAlbums.noReleasesFound', 'No online releases found')}
          </h3>
          <p className="mt-1 text-sm text-font-color-dimmed dark:text-font-color-white/60">
            {t(
              'moreAlbums.offlineNotice',
              'Unable to fetch online discography. Check your internet connection and try again.'
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
      {/* Filter Chips Bar */}
      <div className="flex items-center space-x-2 px-2">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider opacity-60">
          {t('common.filter', 'Filter')}:
        </span>
        {(
          [
            { id: 'all', label: t('common.all', 'All Releases') },
            { id: 'in_library', label: t('moreAlbums.filterInLibrary', 'In Library') },
            { id: 'discover', label: t('moreAlbums.filterDiscover', 'Discover Missing') }
          ] as const
        ).map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-font-color-highlight text-white shadow-md dark:bg-dark-font-color-highlight'
                  : 'bg-background-color-2/60 text-font-color-black hover:bg-background-color-2 dark:bg-dark-background-color-2/60 dark:text-font-color-white dark:hover:bg-dark-background-color-2'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {totalFilteredCount === 0 && (
        <div className="py-12 text-center text-sm opacity-60">
          {t('moreAlbums.noMatchingFilter', 'No releases match the selected filter.')}
        </div>
      )}

      {/* Section 1: Studio Albums */}
      {filteredAlbums.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-3 px-2">
            <h3 className="text-xl font-bold text-font-color-black dark:text-font-color-white">
              {t('moreAlbums.albums', 'Albums')}
            </h3>
            <span className="rounded-full bg-background-color-2 px-2.5 py-0.5 text-xs font-semibold opacity-70 dark:bg-dark-background-color-2">
              {filteredAlbums.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAlbums.map((release) => (
              <OnlineReleaseCard
                key={release.id}
                release={release}
                artistId={artistId}
                artistName={artistName}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Singles & EPs */}
      {filteredSingles.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-3 px-2">
            <h3 className="text-xl font-bold text-font-color-black dark:text-font-color-white">
              {t('moreAlbums.singlesAndEPs', 'Singles & EPs')}
            </h3>
            <span className="rounded-full bg-background-color-2 px-2.5 py-0.5 text-xs font-semibold opacity-70 dark:bg-dark-background-color-2">
              {filteredSingles.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSingles.map((release) => (
              <OnlineReleaseCard
                key={release.id}
                release={release}
                artistId={artistId}
                artistName={artistName}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section 3: Compilations & Live */}
      {filteredCompilations.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-3 px-2">
            <h3 className="text-xl font-bold text-font-color-black dark:text-font-color-white">
              {t('moreAlbums.compilations', 'Compilations & Live')}
            </h3>
            <span className="rounded-full bg-background-color-2 px-2.5 py-0.5 text-xs font-semibold opacity-70 dark:bg-dark-background-color-2">
              {filteredCompilations.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCompilations.map((release) => (
              <OnlineReleaseCard
                key={release.id}
                release={release}
                artistId={artistId}
                artistName={artistName}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default MoreAlbumsTab;
