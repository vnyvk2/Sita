import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useAddSongsToCollection } from '../../hooks/collections/useCollectionMutations';
import { useWindowHydration } from '../../hooks/useWindowHydration';
import { songIdsVersionFromState, songQuery } from '../../queries/songs';
import Button from '../Button';
import Checkbox from '../Checkbox';
import Img from '../Img';
import VirtualizedList from '../VirtualizedList';

interface Props {
  playlistId: number;
  playlistName: string;
  existingSongIds?: number[];
}

export const AddSongsToTargetPlaylistPrompt = ({
  playlistId,
  playlistName,
  existingSongIds = []
}: Props) => {
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSongIdSet, setSelectedSongIdSet] = useState<Set<number>>(new Set());

  const { data: idsData, dataUpdatedAt } = useQuery({
    ...songQuery.ids({ sortType: 'aToZ', keyword: searchTerm.trim() || undefined }),
    placeholderData: keepPreviousData
  });
  const allIds = idsData?.ids ?? [];

  const existingSet = useMemo(() => new Set(existingSongIds), [existingSongIds]);

  const eligibleIds = useMemo(() => {
    return allIds.filter((id) => !existingSet.has(id));
  }, [allIds, existingSet]);

  const idsVersion = songIdsVersionFromState(dataUpdatedAt);
  const { getItem, handleRangeChange } = useWindowHydration(eligibleIds, idsVersion, {
    keyPrefix: 'add-to-playlist',
    listIdentity: `playlist_${playlistId}`
  });

  const addSongsMutation = useAddSongsToCollection();

  const handleAdd = useCallback(() => {
    const songIds = Array.from(selectedSongIdSet);
    if (songIds.length === 0) return;

    addSongsMutation.mutate(
      { playlistId, songIds },
      {
        onSuccess: () => {
          changePromptMenuData(false);
          addNewNotifications([
            {
              id: 'songsAddedToPlaylist',
              duration: 5000,
              iconName: 'playlist_add',
              content: t('addSongsToPlaylistsPrompt.songsAddedToPlaylists', {
                count: songIds.length,
                playlistCount: 1
              })
            }
          ]);
        },
        onError: (err) => console.error(err)
      }
    );
  }, [addSongsMutation, playlistId, selectedSongIdSet, changePromptMenuData, addNewNotifications, t]);

  const toggleSelectAll = useCallback(() => {
    if (selectedSongIdSet.size === eligibleIds.length && eligibleIds.length > 0) {
      setSelectedSongIdSet(new Set());
    } else {
      setSelectedSongIdSet(new Set(eligibleIds));
    }
  }, [selectedSongIdSet, eligibleIds]);

  const toggleSongSelection = useCallback((songId: number) => {
    setSelectedSongIdSet((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  }, []);

  const renderSongRow = useCallback(
    (index: number, songId: number) => {
      const isSelected = selectedSongIdSet.has(songId);
      const song = getItem(index);

      if (!song) {
        return (
          <div
            key={songId}
            className="flex h-14 items-center justify-between rounded-lg px-2"
          >
            <div className="flex items-center gap-3 overflow-hidden pr-2">
              <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-10 w-10 min-w-10 animate-pulse rounded-md" />
              <div className="flex flex-col gap-1 overflow-hidden">
                <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-4 w-32 animate-pulse rounded" />
                <div className="bg-background-color-2 dark:bg-dark-background-color-2 h-3 w-20 animate-pulse rounded" />
              </div>
            </div>
            <Checkbox
              id={`song-${songId}`}
              isChecked={isSelected}
              checkedStateUpdateFunction={() => {}}
            />
          </div>
        );
      }

      return (
        <div
          key={song.songId}
          className={`flex h-14 cursor-pointer items-center justify-between rounded-lg px-2 transition-colors ${
            isSelected
              ? 'bg-background-color-3/50 dark:bg-dark-background-color-3/50'
              : 'hover:bg-background-color-2 dark:hover:bg-dark-background-color-2'
          }`}
          onClick={() => toggleSongSelection(song.songId)}
        >
          <div className="flex items-center gap-3 overflow-hidden pr-2">
            <Img
              src={song.artworkPaths?.artworkPath}
              className="h-10 w-10 min-w-10 rounded-md object-cover"
            />
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-base font-medium">{song.title}</span>
              <span className="text-font-color-dim dark:text-dark-font-color-dim truncate text-xs">
                {song.artists?.map((a) => a.name).join(', ') || 'Unknown Artist'}
              </span>
            </div>
          </div>
          <Checkbox
            id={`song-${song.songId}`}
            isChecked={isSelected}
            checkedStateUpdateFunction={() => {}}
          />
        </div>
      );
    },
    [getItem, selectedSongIdSet, toggleSongSelection]
  );

  return (
    <div className="flex h-[30rem] w-[32rem] flex-col">
      <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-4 text-2xl font-medium">
        {t('playlist.addSongs', 'Add songs to')} {playlistName}
      </div>

      <input
        type="text"
        className="bg-background-color-2! text-font-color-black dark:bg-dark-background-color-2! dark:text-font-color-white mb-4 w-full rounded-xl px-4 py-2 text-base outline-hidden"
        placeholder={t('common.search', 'Search songs...')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-font-color-dim dark:text-dark-font-color-dim">
          {t('common.selectionWithCount', { count: selectedSongIdSet.size })}
        </span>
        {eligibleIds.length > 0 && (
          <button
            type="button"
            className="text-font-color-highlight cursor-pointer text-sm font-medium hover:underline"
            onClick={toggleSelectAll}
          >
            {selectedSongIdSet.size === eligibleIds.length ? 'Unselect All' : 'Select All'}
          </button>
        )}
      </div>

      <div className="h-[350px] min-h-[350px] w-full overflow-hidden">
        {eligibleIds.length > 0 ? (
          <VirtualizedList
            data={eligibleIds}
            fixedItemHeight={56}
            itemContent={renderSongRow}
            onChange={handleRangeChange}
            style={{ height: '350px', width: '100%' }}
          />
        ) : (
          <div className="py-8 text-center text-sm opacity-60">No available songs found</div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button label="Cancel" iconName="close" clickHandler={() => changePromptMenuData(false)} />
        <Button
          label={t('common.add', 'Add')}
          iconName="playlist_add"
          isDisabled={selectedSongIdSet.size === 0}
          clickHandler={handleAdd}
          className="bg-background-color-3! text-font-color-black! dark:bg-dark-background-color-3! dark:text-font-color-black! px-6"
        />
      </div>
    </div>
  );
};

export default AddSongsToTargetPlaylistPrompt;
