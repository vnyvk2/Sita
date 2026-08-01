import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useQuery } from '@tanstack/react-query';
import { collectionEntriesOptions } from '@renderer/hooks/collections/useCollectionQueries';
import { resolvePlaylistCover } from '@renderer/utils/resolvePlaylistCover';
import storage from '@renderer/utils/localStorage';
import MultipleArtworksCover from './MultipleArtworksCover';

type Props = {
  playlist: PlaylistDto;
  songs?: SongData[];
  className?: string;
  imgClassName?: string;
  holderClassName?: string;
  enableImgFadeIns?: boolean;
};

const PlaylistCover = (props: Props) => {
  const { playlist, songs, className, imgClassName, holderClassName, enableImgFadeIns } = props;

  // 1. Read stored settings for this playlist
  const settings = storage.playlistCoverSettings.getSettings(playlist.id);

  const isAutoMode = !settings || settings.type === 'auto';

  // 2. Fetch entries if playlist songs were not provided directly
  const { data: fetchedSongs = [] } = useQuery({
    ...collectionEntriesOptions(playlist.id),
    enabled: !songs && !isAutoMode
  });

  const playlistSongs = songs ?? fetchedSongs;

  // 3. If in auto mode and no pre-loaded songs array: delegate directly to legacy collectionId caching in MultipleArtworksCover
  if (isAutoMode && !songs) {
    return (
      <MultipleArtworksCover
        collectionId={playlist.id}
        className={className}
        imgClassName={imgClassName}
        holderClassName={holderClassName}
        enableImgFadeIns={enableImgFadeIns}
      />
    );
  }

  // 4. Resolve layout and artwork paths via pure resolver utility
  const { layout, artworks } = resolvePlaylistCover(playlist, settings, playlistSongs);

  // 5. Render presentation component
  return (
    <MultipleArtworksCover
      resolvedArtworks={artworks}
      layout={layout}
      className={className}
      imgClassName={imgClassName}
      holderClassName={holderClassName}
      enableImgFadeIns={enableImgFadeIns}
    />
  );
};

export default PlaylistCover;
