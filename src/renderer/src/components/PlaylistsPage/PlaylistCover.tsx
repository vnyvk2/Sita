import type { PlaylistDto } from '@common/collections/dtos';
import { collectionEntriesOptions } from '@renderer/hooks/collections/useCollectionQueries';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import {
  reconstructPlaylistCoverSongs,
  resolvePlaylistCover
} from '@renderer/utils/resolvePlaylistCover';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo, useState } from 'react';

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
  const {
    playlist,
    songs,
    className = '',
    imgClassName = '',
    holderClassName = '',
    enableImgFadeIns
  } = props;

  const enableArtworkFromSongCovers = useStore(
    store,
    (state) => state.localStorage.preferences.enableArtworkFromSongCovers
  );

  const [_settingsVersion, setSettingsVersion] = useState(0);

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

  // Determine if song-based cover resolution requires fetching song metadata
  const requiresSongCovers =
    !songs &&
    (hasCustomCollage ||
      (enableArtworkFromSongCovers && (playlist.itemCount ?? 0) > 0 && !playlist.artworkPath));

  // 2. Fetch minimal playlist entry pointers (limit to 10 for collage, 5 for auto)
  const entryLimit = hasCustomCollage ? 10 : 5;
  const { data: collectionEntries = [] } = useQuery({
    ...collectionEntriesOptions(playlist.id, 0, entryLimit),
    enabled: requiresSongCovers
  });

  // Calculate target song IDs without fetching the entire playlist
  const targetSongIds = useMemo(() => {
    if (!requiresSongCovers) return [];
    if (hasCustomCollage) {
      const configuredIds = (settings?.collage?.songIds ?? []).filter((id) => id > 0);
      const entryIds = collectionEntries.map((e) => e.songId);
      return Array.from(new Set([...configuredIds, ...entryIds]));
    }
    return collectionEntries.map((e) => e.songId);
  }, [requiresSongCovers, hasCustomCollage, settings?.collage?.songIds, collectionEntries]);

  // 3. Fetch full SongData objects using Nora's cached songQuery.allSongInfo
  const { data: fetchedSongData = [] } = useQuery({
    ...songQuery.allSongInfo({
      songIds: targetSongIds,
      sortType: 'addedOrder'
    }),
    enabled: requiresSongCovers && targetSongIds.length > 0
  });

  // 4. Preserve exact playlist position order matching collectionEntries (0, 1, 2, 3...)
  // and append any configured custom collage songs that reside beyond the entry limit
  const playlistSongs: SongData[] = useMemo(() => {
    return reconstructPlaylistCoverSongs(collectionEntries, fetchedSongData, settings, songs);
  }, [songs, fetchedSongData, collectionEntries, settings]);

  // 5. Priority Chain:
  //    (1) Custom Collage (if explicitly set by user, always renders via resolvePlaylistCover)
  //    (2) Playlist Artwork (if user manually uploaded/assigned artwork or static special playlist icon)
  //    (3) Automatic Song Collage (if enableArtworkFromSongCovers is true and itemCount > 0)
  //    (4) Default Playlist Cover (pink fallback)
  if (!hasCustomCollage && playlist.artworkPath) {
    return (
      <div className={`relative aspect-square overflow-hidden rounded-lg shadow-md ${className}`}>
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

  if (!hasCustomCollage && (!enableArtworkFromSongCovers || playlist.itemCount <= 0)) {
    return (
      <div className={`relative aspect-square overflow-hidden rounded-lg shadow-md ${className}`}>
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

  // 6. Resolve layout and artwork paths via single source of truth resolver utility
  const { layout, variant, artworks } = resolvePlaylistCover(playlist, settings, playlistSongs);

  // 7. Render presentation component
  return (
    <MultipleArtworksCover
      resolvedArtworks={artworks}
      layout={layout}
      variant={variant}
      requestedCount={settings?.collage?.size}
      className={className}
      imgClassName={imgClassName}
      holderClassName={holderClassName}
      enableImgFadeIns={enableImgFadeIns}
    />
  );
};

export default PlaylistCover;
