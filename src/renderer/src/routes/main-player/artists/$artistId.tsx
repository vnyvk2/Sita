import ArtistProfileTab from '@renderer/components/ArtistInfoPage/ArtistProfileTab';
import LibraryTab from '@renderer/components/ArtistInfoPage/LibraryTab';
import MoreAlbumsTab from '@renderer/components/ArtistInfoPage/MoreAlbumsTab';
import MainContainer from '@renderer/components/MainContainer';
import { artistQuery } from '@renderer/queries/artists';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/artists/$artistId')({
  validateSearch: songSearchSchema,
  component: ArtistInfoPage,
  loader: async (route) => {
    const artistId = Number(route.params.artistId);
    await queryClient.ensureQueryData(artistQuery.single({ artistId }));
  }
});

export type ArtistTabType = 'library' | 'more_albums' | 'profile';

/**
 * Renders the 3-tab artist page: 1. Library (default, authoritative local songs, albums, and
 * playback) 2. More Albums (online discography browser with 30s previews) 3. Artist Profile
 * (lightweight discovery hub with bio, top tracks, tags, similar artists)
 */
function ArtistInfoPage() {
  const { artistId } = Route.useParams({
    select: (params) => ({ artistId: Number(params.artistId) })
  });

  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ArtistTabType>('library');

  const { data: artistData } = useSuspenseQuery({
    ...artistQuery.single({ artistId }),
    select: (data) => data.data[0] ?? undefined
  });

  const artistDetailSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.artistDetailPage || 'aToZ'
  );
  const { sortingOrder = artistDetailSortingState } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  if (!artistData) {
    return null;
  }

  return (
    <MainContainer className="artist-info-page-container appear-from-bottom relative [scrollbar-gutter:stable] overflow-y-auto rounded-tl-lg pt-8 pr-2 pb-2 pl-2">
      {/* Tab Navigation Bar */}
      <div className="mb-8 flex items-center space-x-3 pl-8">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex items-center space-x-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
            activeTab === 'library'
              ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-md'
              : 'bg-background-color-2/50 text-font-color-black hover:bg-background-color-2 dark:bg-dark-background-color-2/50 dark:text-font-color-white dark:hover:bg-dark-background-color-2'
          }`}
        >
          <span className="material-icons-round text-base">library_music</span>
          <span>{t('artistInfoPage.tabs.library', 'Library')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('more_albums')}
          className={`flex items-center space-x-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
            activeTab === 'more_albums'
              ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-md'
              : 'bg-background-color-2/50 text-font-color-black hover:bg-background-color-2 dark:bg-dark-background-color-2/50 dark:text-font-color-white dark:hover:bg-dark-background-color-2'
          }`}
        >
          <span className="material-icons-round text-base">album</span>
          <span>{t('artistInfoPage.tabs.moreAlbums', 'More Albums')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center space-x-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
            activeTab === 'profile'
              ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight text-white shadow-md'
              : 'bg-background-color-2/50 text-font-color-black hover:bg-background-color-2 dark:bg-dark-background-color-2/50 dark:text-font-color-white dark:hover:bg-dark-background-color-2'
          }`}
        >
          <span className="material-icons-round text-base">person</span>
          <span>{t('artistInfoPage.tabs.artistProfile', 'Artist Profile')}</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'library' && (
        <LibraryTab
          artistData={artistData}
          sortingOrder={sortingOrder as SongSortTypes}
          onSortingOrderChange={(order) =>
            navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) })
          }
        />
      )}

      {activeTab === 'more_albums' && (
        <div className="px-8">
          <MoreAlbumsTab artistId={artistData.artistId} artistName={artistData.name} />
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="px-8">
          <ArtistProfileTab
            artistId={artistData.artistId}
            artistName={artistData.name}
            artistData={artistData}
          />
        </div>
      )}
    </MainContainer>
  );
}

export default ArtistInfoPage;
