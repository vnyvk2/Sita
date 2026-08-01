import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo, useState } from 'react';
import { collectionEntriesOptions } from '@renderer/hooks/collections/useCollectionQueries';
import { songQuery } from '@renderer/queries/songs';
import { resolvePlaylistCover } from '@renderer/utils/resolvePlaylistCover';
import storage from '@renderer/utils/localStorage';
import DefaultPlaylistCover from '../../assets/images/webp/playlist_cover_default.webp';
import Img from '../Img';
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
  const { playlist, songs, className = '', imgClassName = '', holderClassName = '', enableImgFadeIns } = props;

  const enableArtworkFromSongCovers = useStore(
    store,
    (state) => state.localStorage.preferences.enableArtworkFromSongCovers
  );

  const [settingsVersion, setSettingsVersion] = useState(0);

  // Subscribe to cover settings changes for instant real-time UI re-rendering
  useEffect(() => {
    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ playlistId: number }>;
      if (customEvent.detail?.playlistId === playlist.id) {
        setSettingsVersion((prev) => prev + 1);
      }
    };
    window.addEventListener('playlist-cover-settings-changed', handleSettingsChange);
    return () => {
      window.removeEventListener('playlist-cover-settings-changed', handleSettingsChange);
    };
  }, [playlist.id]);

  // 1. Read stored settings for this playlist
  const settings = storage.playlistCoverSettings.getSettings(playlist.id);
  const hasCustomCollage = settings?.type === 'collage';
  const isAutoMode = !hasCustomCollage;

  // 2. Fetch playlist entry pointers when songs prop is not provided (ALWAYS CALL HOOKS AT TOP OF COMPONENT)
  const { data: collectionEntries = [] } = useQuery({
    ...collectionEntriesOptions(playlist.id),
    enabled: !songs && hasCustomCollage
  });

  // 3. Fetch full SongData objects using Nora's cached songQuery.allSongInfo
  const { data: fetchedSongData = [] } = useQuery({
    ...songQuery.allSongInfo({
      songIds: collectionEntries.map((e) => e.songId),
      sortType: 'addedOrder'
    }),
    enabled: !songs && hasCustomCollage && collectionEntries.length > 0
  });

  // 4. Preserve exact playlist position order matching collectionEntries (0, 1, 2, 3...)
  const playlistSongs: SongData[] = useMemo(() => {
    if (songs) return songs;
    const songMap = new Map(fetchedSongData.map((s) => [s.songId, s]));
    const positionOrderedSongs: SongData[] = [];
    for (const entry of collectionEntries) {
      const song = songMap.get(entry.songId);
      if (song) positionOrderedSongs.push(song);
    }
    return positionOrderedSongs;
  }, [songs, fetchedSongData, collectionEntries]);

  // --- ALL HOOKS ARE NOW EXECUTED UNCONDITIONALLY AT THE TOP ---

  // 5. Option A Priority Chain:
  //    (1) Custom Collage (if explicitly set by user)
  //    (2) Playlist Artwork (if user manually uploaded/assigned artwork or static special playlist icon)
  //    (3) Automatic Song Collage (if enableArtworkFromSongCovers is true and itemCount > 1)
  //    (4) Default Playlist Cover (pink fallback)
  if (!hasCustomCollage && playlist.artworkPath) {
    return (
      <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
        <Img
          src={playlist.artworkPath}
          fallbackSrc={DefaultPlaylistCover}
          alt="Playlist Cover"
          className={`h-full w-full object-cover ${imgClassName}`}
          enableImgFadeIns={enableImgFadeIns}
        />
      </div>
    );
  }

  if (!hasCustomCollage && (!enableArtworkFromSongCovers || playlist.itemCount <= 1)) {
    return (
      <div className={`relative overflow-hidden rounded-lg shadow-md aspect-square ${className}`}>
        <Img
          src={DefaultPlaylistCover}
          fallbackSrc={DefaultPlaylistCover}
          alt="Playlist Cover"
          className={`h-full w-full object-cover ${imgClassName}`}
          enableImgFadeIns={enableImgFadeIns}
        />
      </div>
    );
  }

  // 6. If in auto mode and no pre-loaded songs array: delegate directly to legacy collectionId caching in MultipleArtworksCover
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

  // 7. Resolve layout and artwork paths via pure resolver utility (strictly type-checked SongData[])
  const { layout, artworks } = resolvePlaylistCover(playlist, settings, playlistSongs);

  // 8. Render presentation component
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
