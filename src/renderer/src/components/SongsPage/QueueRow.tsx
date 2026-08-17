import { Draggable } from '@hello-pangea/dnd';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Song from './Song';

export interface QueueRowProps {
  index: number;
  songId: number;
  song: SongData;
  isIndexingSongs: boolean;
  selectAllHandler?: (_upToId?: number) => void;
  onPlaySong: (index: number, songId: number) => void;
  onRemoveSong: (songId: number) => void;
}

const QueueRow = memo(function QueueRow({
  index,
  songId,
  song,
  isIndexingSongs,
  selectAllHandler,
  onPlaySong,
  onRemoveSong
}: QueueRowProps) {
  const { t } = useTranslation();

  const handlePlayClick = useCallback(() => {
    onPlaySong(index, songId);
  }, [onPlaySong, index, songId]);

  const additionalContextMenuItems = useMemo(
    () => [
      {
        label: t('common.removeFromQueue'),
        iconName: 'remove_circle_outline',
        handlerFunction: () => onRemoveSong(songId)
      }
    ],
    [t, onRemoveSong, songId]
  );

  return (
    <Draggable
      draggableId={`${song.songId}-${index}`}
      index={index}
      key={`${song.songId}-${index}`}
    >
      {(provided) => (
        <Song
          provided={provided}
          key={`${song.songId}-${index}`}
          isDraggable
          index={index}
          ref={provided.innerRef}
          isIndexingSongs={isIndexingSongs}
          {...song}
          trackNo={undefined}
          selectAllHandler={selectAllHandler}
          onPlayClick={handlePlayClick}
          additionalContextMenuItems={additionalContextMenuItems}
        />
      )}
    </Draggable>
  );
});

export default QueueRow;
