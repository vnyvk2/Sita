import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import Button from '../Button';
import Checkbox from '../Checkbox';
import Img from '../Img';

interface Props {
  playlistSongs: SongData[];
  maxSize: 1 | 2 | 3 | 4;
  selectedSongIds: number[];
  onSave: (selectedIds: number[]) => void;
  onCancel: () => void;
}

const CollageSongPickerPrompt = (props: Props) => {
  const { playlistSongs, maxSize, selectedSongIds, onSave, onCancel } = props;
  const { t } = useTranslation();

  const [selectedIds, setSelectedIds] = useState<number[]>(selectedSongIds);

  const toggleSongSelection = useCallback(
    (songId: number) => {
      setSelectedIds((prev) => {
        const isSelected = prev.includes(songId);
        if (isSelected) {
          return prev.filter((id) => id !== songId);
        }
        if (maxSize === 1) {
          return [songId];
        }
        if (prev.length >= maxSize) {
          return prev;
        }
        return [...prev, songId];
      });
    },
    [maxSize]
  );

  const handleSave = useCallback(() => {
    onSave(selectedIds);
  }, [onSave, selectedIds]);

  return (
    <div className="flex h-[450px] w-[450px] flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-font-color-black dark:text-font-color-white text-xl font-semibold">
          {t('playlistsPage.chooseCollageSongs', 'Choose Cover Songs')}
        </span>
        <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm font-medium">
          {selectedIds.length} / {maxSize} {t('common.selected', 'Selected')}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {playlistSongs.map((song) => {
          const isChecked = selectedIds.includes(song.songId);
          const isMaxReached = !isChecked && maxSize > 1 && selectedIds.length >= maxSize;

          return (
            <div
              key={song.songId}
              onClick={() => !isMaxReached && toggleSongSelection(song.songId)}
              className={`flex cursor-pointer items-center justify-between rounded-lg p-2 transition-colors ${
                isChecked
                  ? 'bg-font-color-highlight/10 dark:bg-dark-font-color-highlight/10'
                  : isMaxReached
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-font-color-black/5 dark:hover:bg-font-color-white/5'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Img
                  src={song.artworkPaths?.artworkPath || DefaultImgCover}
                  fallbackSrc={DefaultImgCover}
                  className="h-10 w-10 rounded-md object-cover"
                />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-font-color-black dark:text-font-color-white truncate text-sm font-medium">
                    {song.title}
                  </span>
                  <span className="text-font-color-black dark:text-font-color-white truncate text-xs opacity-70">
                    {song.artists?.map((a) => a.name).join(', ') || 'Unknown Artist'}
                  </span>
                </div>
              </div>
              <Checkbox
                id={`collage-song-picker-${song.songId}`}
                isChecked={isChecked}
                isDisabled={isMaxReached}
                checkedStateUpdateFunction={() => toggleSongSelection(song.songId)}
              />
            </div>
          );
        })}
      </div>

      <div className="border-font-color-black/10 dark:border-font-color-white/10 mt-4 flex items-center justify-end gap-3 border-t pt-3">
        <Button label={t('common.cancel')} clickHandler={onCancel} />
        <Button label={t('common.save', 'Save')} clickHandler={handleSave} />
      </div>
    </div>
  );
};

export default CollageSongPickerPrompt;
