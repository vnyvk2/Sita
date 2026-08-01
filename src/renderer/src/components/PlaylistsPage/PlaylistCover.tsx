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

  // 1. Fetch entries if playlist songs were not provided directly
  const { data: fetchedSongs = [] } = useQuery({
    ...collectionEntriesOptions(playlist.id),
    enabled: !songs
  });

  const playlistSongs = songs ?? fetchedSongs;

  // 2. Read stored settings for this playlist
  const settings = storage.playlistCoverSettings.getSettings(playlist.id);

  // 3. Resolve layout and artwork paths via pure resolver utility
  const { layout, artworks } = resolvePlaylistCover(playlist, settings, playlistSongs);

  // 4. Render pure presentation component
  return (
    <MultipleArtworksCover
      artworks={artworks}
      layout={layout}
      className={className}
      imgClassName={imgClassName}
      holderClassName={holderClassName}
      enableImgFadeIns={enableImgFadeIns}
    />
  );
};

export default PlaylistCover;
