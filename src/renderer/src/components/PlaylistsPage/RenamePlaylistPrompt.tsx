import type { PlaylistDto } from '@common/collections/dtos';
/* eslint-disable jsx-a11y/no-autofocus */
import { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useRenameCollection } from '../../hooks/collections/useCollectionMutations';
import Button from '../Button';
import PlaylistCover from './PlaylistCover';

interface Props {
  playlistData: PlaylistDto;
}

const RenamePlaylistPrompt = (props: Props) => {
  const { playlistData } = props;
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const { id, name } = playlistData;

  const [input, setInput] = useState(name);

  const renameCollection = useRenameCollection();

  const renamePlaylist = useCallback(
    (newName: string) => {
      if (!id) return;
      // IPC validation rejects empty names - surface that here instead of
      // failing silently in the mutation's console error.
      const trimmedName = newName.trim();
      if (!trimmedName) {
        addNewNotifications([
          {
            id: 'EmptyPlaylistName',
            duration: 5000,
            content: t('newPlaylistPrompt.playlistNameEmpty')
          }
        ]);
        return;
      }
      renameCollection.mutate(
        { playlistId: id, newName: trimmedName },
        {
          onSuccess: () => {
            changePromptMenuData(false);
          },
          onError: (err) => {
            console.error(err);
          }
        }
      );
    },
    [addNewNotifications, changePromptMenuData, id, renameCollection, t]
  );

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="img-container relative mb-8 flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl">
        <PlaylistCover playlist={playlistData} className="h-48 w-48 rounded-xl shadow-lg" />
      </div>
      <span className="mb-4 text-center text-2xl font-medium">
        {t('renamePlaylistPrompt.renamePlaylistWithName', { name })}
      </span>
      <input
        type="text"
        name="playlistName"
        className="playlist-name-input bg-background-color-2! text-font-color-black dark:bg-dark-background-color-2! dark:text-font-color-white w-fit max-w-[75%] min-w-100 rounded-2xl border-transparent px-6 py-3 text-lg outline-hidden"
        placeholder={t('renamePlaylistPrompt.playlistName')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') renamePlaylist(e.currentTarget.value);
        }}
        autoFocus
      />
      <Button
        label={t('playlist.renamePlaylist')}
        iconName="edit"
        className="bg-background-color-3! text-font-color-black! dark:bg-dark-background-color-3! dark:text-font-color-black mt-6 mr-0! cursor-pointer justify-center p-2 px-8! py-3! text-lg"
        clickHandler={() => renamePlaylist(input)}
      />
    </div>
  );
};

export default RenamePlaylistPrompt;
