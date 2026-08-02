import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import Checkbox from '../Checkbox';
import Img from '../Img';
import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';

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
        <span className="text-xl font-semibold text-font-color-black dark:text-font-color-white">
          {t('playlistsPage.chooseCollageSongs', 'Choose Cover Songs')}
        </span>
        <span className="text-sm text-font-color-highlight dark:text-dark-font-color-highlight font-medium">
          {selectedIds.length} / {maxSize} {t('common.selected', 'Selected')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {playlistSongs.map((song) => {
          const isChecked = selectedIds.includes(song.songId);
          const isMaxReached = !isChecked && maxSize > 1 && selectedIds.length >= maxSize;

          return (
            <div
              key={song.songId}
              onClick={() => !isMaxReached && toggleSongSelection(song.songId)}
              className={`flex items-center justify-between rounded-lg p-2 transition-colors cursor-pointer ${
                isChecked
                  ? 'bg-font-color-highlight/10 dark:bg-dark-font-color-highlight/10'
                  : isMaxReached
                  ? 'opacity-50 cursor-not-allowed'
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
                  <span className="truncate text-sm font-medium text-font-color-black dark:text-font-color-white">
                    {song.title}
                  </span>
                  <span className="truncate text-xs opacity-70 text-font-color-black dark:text-font-color-white">
                    {song.artists?.map((a) => a.name).join(', ') || 'Unknown Artist'}
                  </span>
                </div>
              </div>
              <Checkbox
                isChecked={isChecked}
                isDisabled={isMaxReached}
                onChange={() => toggleSongSelection(song.songId)}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 pt-3 border-t border-font-color-black/10 dark:border-font-color-white/10">
        <Button
          label={t('common.cancel')}
          type="tertiary"
          clickHandler={onCancel}
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

export default CollageSongPickerPrompt;
