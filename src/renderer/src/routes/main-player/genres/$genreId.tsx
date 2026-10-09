import GenreImgAndInfoContainer from '@renderer/components/GenreInfoPage/GenreImgAndInfoContainer';
import MainContainer from '@renderer/components/MainContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songFilterOptions, songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { genreQuery } from '@renderer/queries/genres';
import {
  getSongListIdentity,
  songCacheKeys,
  songIdsVersionFromState,
  songQuery,
  type SongIdsParams
} from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/genres/$genreId')({
  validateSearch: songSearchSchema,
  component: GenreInfoPage,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    filteringOrder: search.filteringOrder
  }),
  loader: async ({ params, deps }) => {
    if (typeof window === 'undefined') return;
    const genre = await queryClient.ensureQueryData(
      genreQuery.single({ genreId: Number(params.genreId) })
    );
    const genreItem = genre?.data?.[0];
    if (
      genreItem &&
      genreItem.songs &&
      genreItem.songs.length > 0 &&
      window.api?.audioLibraryControls
    ) {
      const sortingState = storage.sortingStates.getSortingStates('genreDetailPage');
      const idsParams: SongIdsParams = {
        restrictToIds: genreItem.songs.map((s) => s.songId),
        sortType: deps?.sortingOrder ?? sortingState ?? 'aToZ',
        filterType: deps?.filteringOrder ?? 'notSelected'
      };
      const idsData = await queryClient.fetchQuery(songQuery.ids(idsParams));
      if (idsData.ids.length === 0) return;
      const state = queryClient.getQueryState(songQuery.ids(idsParams).queryKey);
      const version = songIdsVersionFromState(state?.dataUpdatedAt);
      const listIdentity = getSongListIdentity(idsParams);
      await queryClient.ensureQueryData({
        queryKey: songCacheKeys.window(listIdentity, version, 0),
        queryFn: () =>
          window.api.audioLibraryControls.getSongInfo(
            idsData.ids.slice(0, Math.min(200, idsData.ids.length)),
            undefined,
            undefined,
            undefined,
            true
          ),
        staleTime: 5 * 60 * 1000
      });
    }
  }
});

/**
 * Renders the Genre Info page for the main player, showing genre details, a virtualized list of
 * songs using ID-first windowed hydration, and controls for playback, queueing, sorting, and filtering.
 */
function GenreInfoPage() {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const genreDetailSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.genreDetailPage || 'aToZ'
  );

  const { createQueue, updateQueueData, addNewNotifications } = useContext(AppUpdateContext);

  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { genreId } = Route.useParams({
    select: (params) => ({ genreId: Number(params.genreId) })
  });
  const { sortingOrder = genreDetailSortingState, filteringOrder = 'notSelected' } =
    Route.useSearch();

  const scrollKey = useMemo(
    () => `genre-songs:${genreId}:${sortingOrder}:${filteringOrder}`,
    [genreId, sortingOrder, filteringOrder]
  );

  useEffect(() => {
    storage.sortingStates.setSortingStates('genreDetailPage', sortingOrder);
  }, [sortingOrder]);

  const { data: genreData } = useSuspenseQuery({
    ...genreQuery.single({ genreId }),
    select: (data) => data.data[0]
  });

  const genreSongIds = useMemo(
    () => genreData?.songs.map((song) => song.songId) ?? [],
    [genreData?.songs]
  );

  const songIdsParams: SongIdsParams = useMemo(
    () => ({
      restrictToIds: genreSongIds,
      sortType: sortingOrder,
      filterType: filteringOrder
    }),
    [genreSongIds, sortingOrder, filteringOrder]
  );

  const idsQuery = useQuery({
    ...songQuery.ids(songIdsParams),
    enabled: genreSongIds.length > 0
  });

  const sortedSongIds = idsQuery.data?.ids ?? [];
  const idsVersion = songIdsVersionFromState(idsQuery.dataUpdatedAt);
  const listIdentity = useMemo(() => getSongListIdentity(songIdsParams), [songIdsParams]);

  const blacklistedSet = useMemo(
    () => new Set(idsQuery.data?.blacklistedIds ?? []),
    [idsQuery.data?.blacklistedIds]
  );

  const playableSongIds = useMemo(
    () => sortedSongIds.filter((id) => !blacklistedSet.has(id)),
    [sortedSongIds, blacklistedSet]
  );

  const { getItem, onRangeChange } = useWindowHydration(sortedSongIds, idsVersion, {
    enabled: Boolean(idsQuery.data && sortedSongIds.length > 0),
    listIdentity,
    isCompactView: preferences?.isCompactSongView,
    rowHeight: 60
  });

  const selectAllHandler = useSelectAllHandler(playableSongIds, 'songs');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      createQueue(playableSongIds, 'genre', false, genreData?.genreId, false, genreData?.name);
      updateQueueData(playableSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, genreData?.genreId, genreData?.name, playableSongIds]
  );

  const renderSong = useCallback(
    (index: number) => {
      const song = getItem(index);
      if (song) {
        return (
          <Song
            key={song.songId}
            index={index}
            isIndexingSongs={preferences?.isSongIndexingEnabled}
            onPlayClick={handleSongPlayBtnClick}
            selectAllHandler={selectAllHandler}
            isCompact={preferences?.isCompactSongView}
            isDelegated={true}
            {...song}
            trackNo={undefined}
          />
        );
      }
      return (
        <SongRowSkeleton
          index={index}
          isCompact={preferences?.isCompactSongView}
          rowSize={preferences?.isCompactSongView ? 'small' : 'normal'}
        />
      );
    },
    [
      getItem,
      handleSongPlayBtnClick,
      preferences?.isCompactSongView,
      preferences?.isSongIndexingEnabled,
      selectAllHandler
    ]
  );

  return (
    <MainContainer
      className="appear-from-bottom genre-info-page-container h-full! pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      <TitleContainer
        title={genreData?.name || ''}
        className="pr-4"
        buttons={[
          {
            tooltipLabel: t('common.playAll'),
            iconName: 'play_arrow',
            clickHandler: () =>
              createQueue(
                playableSongIds,
                'genre',
                false,
                genreData?.genreId,
                true
              ),
            isDisabled: !(genreData && sortedSongIds.length > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: () =>
              createQueue(
                playableSongIds,
                'genre',
                true,
                genreData?.genreId,
                true
              ),
            isDisabled: !(genreData && sortedSongIds.length > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: () => {
              getQueuesManager().getActiveQueue().addSongIdsToEnd(playableSongIds);
              addNewNotifications([
                {
                  id: String(genreData?.genreId || ''),
                  duration: 5000,
                  content: t('notifications.addedToQueue', {
                    count: playableSongIds.length
                  })
                }
              ]);
            },
            isDisabled: !(genreData && sortedSongIds.length > 0)
          }
        ]}
        dropdowns={[
          {
            name: 'songsPageFilterDropdown',
            type: `${t('common.filterBy')} :`,
            value: filteringOrder,
            options: songFilterOptions,
            onChange: (e) => {
              navigate({
                search: (prev) => ({
                  ...prev,
                  filteringOrder: e.currentTarget.value as SongFilterTypes
                })
              });
            }
          },
          {
            name: 'songsPageSortDropdown',
            type: `${t('common.sortBy')} :`,
            value: sortingOrder,
            options: songSortOptions,
            onChange: (e) => {
              const order = e.currentTarget.value as SongSortTypes;
              navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) });
            },
            isDisabled: !(genreData && sortedSongIds.length > 0)
          }
        ]}
      />

      <VirtualizedList
        data={sortedSongIds}
        fixedItemHeight={60}
        scrollKey={scrollKey}
        computeItemKey={(_index, id) => id}
        onChange={onRangeChange}
        components={{
          Header: () => <GenreImgAndInfoContainer genreData={genreData} genreSongs={[]} />
        }}
        itemContent={renderSong}
      />
    </MainContainer>
  );
}

export default GenreInfoPage;
