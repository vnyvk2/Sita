import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import type { PlaylistCoverSettings } from '../../types/playlistCover';
import storage from '../../utils/localStorage';
import Button from '../Button';
import Img from '../Img';
import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import CollageSongPickerPrompt from './CollageSongPickerPrompt';

interface Props {
  playlist: PlaylistDto;
  playlistSongs: SongData[];
}

const PlaylistCoverSettingsPrompt = ({ playlist, playlistSongs }: Props) => {
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const initialSettings: PlaylistCoverSettings = useMemo(() => {
    return (
      storage.playlistCoverSettings.getSettings(playlist.id) ?? {
        type: 'auto',
        collage: {
          layout: 'grid',
          size: 4,
          songIds: []
        }
      }
    );
  }, [playlist.id]);

  const [type, setType] = useState<'auto' | 'collage'>(initialSettings.type);
  const [size, setSize] = useState<1 | 2 | 3 | 4>(initialSettings.collage?.size ?? 4);
  const [selectedSongIds, setSelectedSongIds] = useState<number[]>(
    initialSettings.collage?.songIds ?? []
  );

  const selectedSongs = useMemo(() => {
    const map = new Map(playlistSongs.map((s) => [s.songId, s]));
    return selectedSongIds
      .map((id) => map.get(id))
      .filter((song): song is SongData => Boolean(song));
  }, [playlistSongs, selectedSongIds]);

  const handleOpenSongPicker = useCallback(() => {
    changePromptMenuData(
      true,
      <CollageSongPickerPrompt
        playlistSongs={playlistSongs}
        maxSize={size}
        selectedSongIds={selectedSongIds}
        onSave={(newIds) => {
          setSelectedSongIds(newIds);
          // Restore cover settings prompt
          changePromptMenuData(
            true,
            <PlaylistCoverSettingsPrompt playlist={playlist} playlistSongs={playlistSongs} />
          );
        }}
        onCancel={() => {
          changePromptMenuData(
            true,
            <PlaylistCoverSettingsPrompt playlist={playlist} playlistSongs={playlistSongs} />
          );
        }}
      />
    );
  }, [changePromptMenuData, playlist, playlistSongs, selectedSongIds, size]);

  const handleSave = useCallback(() => {
    const newSettings: PlaylistCoverSettings = {
      type,
      collage: {
        layout: 'grid',
        size,
        songIds: selectedSongIds
      }
    };
    storage.playlistCoverSettings.setSettings(playlist.id, newSettings);
    changePromptMenuData(false);
  }, [changePromptMenuData, playlist.id, selectedSongIds, size, type]);

  return (
    <div className="flex w-[420px] flex-col p-4 text-font-color-black dark:text-font-color-white">
      <div className="mb-4 text-xl font-semibold">
        {t('playlistsPage.coverSettingsTitle', 'Playlist Cover Settings')}
      </div>

      {/* Cover Type Selector */}
      <div className="mb-4">
        <label className="mb-2 block text-xs font-semibold uppercase opacity-70">
          {t('playlistsPage.coverType', 'Cover Type')}
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="coverType"
              checked={type === 'auto'}
              onChange={() => setType('auto')}
              className="accent-font-color-highlight dark:accent-dark-font-color-highlight"
            />
            {t('playlistsPage.coverTypeAuto', 'Auto (Default)')}
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="coverType"
              checked={type === 'collage'}
              onChange={() => setType('collage')}
              className="accent-font-color-highlight dark:accent-dark-font-color-highlight"
            />
            {t('playlistsPage.coverTypeCollage', 'Song Collage')}
          </label>
        </div>
      </div>

      {/* Grid Size Selector */}
      {type === 'collage' && (
        <>
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase opacity-70">
              {t('playlistsPage.numberofImages', 'Number of Images')}
            </label>
            <div className="flex gap-4">
              {([1, 2, 3, 4] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm font-medium">
                  <input
                    type="radio"
                    name="collageSize"
                    checked={size === s}
                    onChange={() => {
                      setSize(s);
                      if (selectedSongIds.length > s) {
                        setSelectedSongIds(selectedSongIds.slice(0, s));
                      }
                    }}
                    className="accent-font-color-highlight dark:accent-dark-font-color-highlight"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Selected Songs List */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase opacity-70">
                {t('playlistsPage.selectedSongs', 'Selected Songs')} ({selectedSongs.length}/{size})
              </label>
              <Button
                label={t('playlistsPage.chooseSongs', 'Choose Songs')}
                type="tertiary"
                clickHandler={handleOpenSongPicker}
              />
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-font-color-black/10 dark:border-font-color-white/10 p-2">
              {selectedSongs.length === 0 ? (
                <span className="text-xs opacity-60 italic block py-2 text-center">
                  {t('playlistsPage.noSongsChosen', 'No specific songs chosen. Will auto-fill from playlist.')}
                </span>
              ) : (
                selectedSongs.map((song, i) => (
                  <div key={song.songId} className="flex items-center gap-2 text-xs py-1">
                    <span className="font-semibold opacity-60 w-4 text-center">{i + 1}.</span>
                    <Img
                      src={song.artworkPaths?.artworkPath || DefaultImgCover}
                      fallbackSrc={DefaultImgCover}
                      className="h-6 w-6 rounded object-cover"
                    />
                    <span className="truncate flex-1">{song.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Footer Controls */}
      <div className="mt-2 flex items-center justify-end gap-3 pt-3 border-t border-font-color-black/10 dark:border-font-color-white/10">
        <Button
          label={t('common.cancel')}
          type="tertiary"
          clickHandler={() => changePromptMenuData(false)}
        />
        <Button
          label={t('common.save')}
          type="primary"
          clickHandler={handleSave}
        />
      </div>
    </div>
  );
};

export default PlaylistCoverSettingsPrompt;
