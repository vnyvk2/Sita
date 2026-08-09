import { SpecialPlaylists } from '@common/playlists.enum';
import type { PlaylistDto as CollectionDto } from '@common/collections/dtos';
import { CollectionClient } from '../../api/CollectionClient';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useBulkDeleteCollections } from '../../hooks/collections/useCollectionMutations';
import Button from '../Button';

interface ConfirmDeletePlaylistProp {
  playlistIds: (number | string)[];
  playlistName?: string;
}

const ConfirmDeletePlaylistsPrompt = (props: ConfirmDeletePlaylistProp) => {
  const { addNewNotifications, changePromptMenuData, toggleMultipleSelections } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const { playlistIds, playlistName } = props;

  const numericPlaylistIds = useMemo(() => {
    return playlistIds
      .map((id) => Number(id))
      .filter((id) => !isNaN(id) && !SpecialPlaylists.isSpecialPlaylistId(id));
  }, [playlistIds]);

  const [playlistsData, setPlaylistsData] = useState<CollectionDto[]>([]);
  const bulkDelete = useBulkDeleteCollections();

  useEffect(() => {
    if (numericPlaylistIds.length > 0) {
      Promise.all(numericPlaylistIds.map((id) => CollectionClient.getCollection(id)))
        .then((res) => {
          const valid = res.filter(Boolean) as CollectionDto[];
          if (valid.length > 0) {
            return setPlaylistsData(valid);
          }
          return undefined;
        })
        .catch((err) => console.error('Failed to load playlist details for delete prompt:', err));
    }
  }, [numericPlaylistIds]);

  const arePlaylistsRemovable = useMemo(() => {
    return (
      numericPlaylistIds.length > 0 &&
      !playlistIds.some((playlistId) => SpecialPlaylists.isSpecialPlaylistId(playlistId))
    );
  }, [playlistIds, numericPlaylistIds]);

  const removePlaylists = useCallback(() => {
    if (numericPlaylistIds.length === 0) return;

    bulkDelete.mutate(
      { playlistIds: numericPlaylistIds },
      {
        onSuccess: () => {
          changePromptMenuData(false);
          toggleMultipleSelections(false);
          addNewNotifications([
            {
              id: `playlistsDeleted`,
              duration: 5000,
              content: t('confirmDeletePlaylistsPrompt.playlistsDeletedWithCount', {
                count: numericPlaylistIds.length
              })
            }
          ]);
        },
        onError: (err) => console.error('Failed to bulk delete playlists:', err)
      }
    );
  }, [addNewNotifications, changePromptMenuData, toggleMultipleSelections, numericPlaylistIds, t, bulkDelete]);

  return (
    <>
      <div className="title-container text-font-color-black dark:text-font-color-white mt-1 mb-8 flex items-center pr-4 text-3xl font-medium">
        {t('confirmDeletePlaylistsPrompt.confirmPlaylistDeleteWithCount', {
          count: numericPlaylistIds.length,
          playlistName
        })}
      </div>
      <div className="description">
        {t('confirmDeletePlaylistsPrompt.message', {
          count: numericPlaylistIds.length
        })}
        <div className="info-about-affecting-files-container mt-4">
          <p>{t('confirmDeletePlaylistsPrompt.modificationNotice')}</p>
          <ul className="ml-4 list-inside list-disc">
            {playlistsData.map((playlist) => (
              <li className="text-sm font-light" key={playlist.id}>
                {playlist.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {!arePlaylistsRemovable && (
        <h4 className="text-font-color-crimson mt-8 flex items-center justify-center font-medium">
          <span className="material-icons-round-outlined mr-2 text-lg">warning</span>{' '}
          {t('resetAppConfirmationPrompt.systemPlaylistsRemovalProhibited')}
        </h4>
      )}
      {arePlaylistsRemovable && (
        <div className="buttons-container mt-8 flex w-full justify-end">
          <Button
            label={t('playlist.deletePlaylist', {
              count: playlistsData.length || numericPlaylistIds.length
            })}
            className="delete-playlist-btn danger-btn bg-font-color-crimson! text-font-color-white hover:border-font-color-crimson dark:bg-font-color-crimson! dark:text-font-color-white dark:hover:border-font-color-crimson float-right h-10 w-48 cursor-pointer rounded-lg border-transparent outline-hidden ease-in-out"
            clickHandler={removePlaylists}
          />
        </div>
      )}
    </>
  );
};

export default ConfirmDeletePlaylistsPrompt;
