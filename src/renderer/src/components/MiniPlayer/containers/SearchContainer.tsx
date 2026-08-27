import { getQueuesManager } from '@renderer/other/queuesManager';
import { searchQuery } from '@renderer/queries/search';
import { songQuery } from '@renderer/queries/songs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import { type VirtuosoHandle } from 'react-virtuoso';

import DefaultSongCover from '../../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import calculateTime from '../../../utils/calculateTime';
import Img from '../../Img';
import VirtualizedList from '../../VirtualizedList';

type MiniSearchFilter = Extract<SearchFilters, 'All' | 'Songs' | 'Artists' | 'Albums'>;

type MiniSearchRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'song'; id: string; song: SongData }
  | { kind: 'artist'; id: string; artist: Artist }
  | { kind: 'album'; id: string; album: Album };

const ROW_HEIGHT = 52;
const DEBOUNCE_MS = 250;
const FILTERS: MiniSearchFilter[] = ['All', 'Songs', 'Artists', 'Albums'];

const FILTER_LABEL_KEYS: Record<MiniSearchFilter, string> = {
  All: 'common.all',
  Songs: 'common.song_other',
  Artists: 'common.artist_other',
  Albums: 'common.album_other'
};

type MiniSearchSongRowProps = {
  song: SongData;
  isActive: boolean;
  addToQueueText: string;
  playText: string;
  unknownArtistText: string;
  onPlay: (song: SongData) => void;
  onAddToQueue: (song: SongData) => void;
};

const MiniSearchSongRow = memo((props: MiniSearchSongRowProps) => {
  const { song, isActive, addToQueueText, playText, unknownArtistText, onPlay, onAddToQueue } =
    props;

  const { minutes, seconds } = calculateTime(song.duration);
  const formattedDuration = `${Number(minutes)}:${seconds}`;

  return (
    <button
      type="button"
      tabIndex={-1}
      data-testid={`mini-search-song-${song.songId}`}
      className={`group/search-song flex h-[52px] max-h-[52px] min-h-[52px] w-full cursor-pointer items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-left transition-colors duration-150 ${
        isActive ? 'bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20' : 'hover:bg-font-color-white/10'
      }`}
      onClick={() => onPlay(song)}
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded">
        <Img
          src={song.artworkPaths?.optimizedArtworkPath || song.artworkPaths?.artworkPath}
          fallbackSrc={DefaultSongCover}
          loading="lazy"
          alt={song.title}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-tight text-font-color-white">{song.title}</div>
        <div className="text-font-color-white/60 mt-0.5 truncate text-xs leading-tight">
          {song.artists?.map((a) => a.name).join(', ') || unknownArtistText}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
        <span
          role="button"
          tabIndex={0}
          aria-label={addToQueueText}
          className="text-font-color-white/40 hover:text-font-color-highlight flex h-7 w-7 cursor-pointer items-center justify-center rounded-full opacity-0 transition-all hover:bg-white/10 group-hover/search-song:opacity-100"
          title={addToQueueText}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAddToQueue(song);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onAddToQueue(song);
            }
          }}
        >
          <span className="material-icons-round text-base">playlist_add</span>
        </span>

        <span
          title={playText}
          className="text-font-color-white/40 group-hover/search-song:text-font-color-highlight flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        >
          <span className="material-icons-round text-lg">play_arrow</span>
        </span>

        <div className="text-font-color-white/50 min-w-[30px] text-right text-xs tabular-nums">
          {formattedDuration}
        </div>
      </div>
    </button>
  );
});

type MiniSearchEntityRowProps = {
  title: string;
  subtitle: string;
  artworkSrc?: string;
  isCircularArtwork?: boolean;
  isActive: boolean;
  testId: string;
  onPlay: () => void;
};

const MiniSearchEntityRow = memo((props: MiniSearchEntityRowProps) => {
  const { title, subtitle, artworkSrc, isCircularArtwork = false, isActive, testId, onPlay } =
    props;

  return (
    <button
      type="button"
      tabIndex={-1}
      data-testid={testId}
      className={`flex h-[52px] max-h-[52px] min-h-[52px] w-full cursor-pointer items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-left transition-colors duration-150 ${
        isActive ? 'bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20' : 'hover:bg-font-color-white/10'
      }`}
      onClick={onPlay}
    >
      <div
        className={`relative h-8 w-8 shrink-0 overflow-hidden ${
          isCircularArtwork ? 'rounded-full' : 'rounded'
        }`}
      >
        <Img
          src={artworkSrc}
          fallbackSrc={DefaultSongCover}
          loading="lazy"
          alt={title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
          <span className="material-icons-round text-lg! text-font-color-white">play_arrow</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-tight text-font-color-white">{title}</div>
        <div className="text-font-color-white/60 mt-0.5 truncate text-xs leading-tight">
          {subtitle}
        </div>
      </div>
    </button>
  );
});

type Props = { isSearchVisible: boolean; onClose: () => void };

const EMPTY_RESULTS: SearchResult = {
  songs: [],
  artists: [],
  albums: [],
  playlists: [],
  genres: [],
  availableResults: [],
  confidence: { songs: 0, artists: 0, albums: 0, playlists: 0, genres: 0 }
};

const SearchContainer = (props: Props) => {
  const { isSearchVisible, onClose } = props;
  const { t } = useTranslation();

  const { createQueue, updateQueueData, addNewNotifications } = useContext(AppUpdateContext);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [filter, setFilter] = useState<MiniSearchFilter>('All');
  const [activeRowIndex, setActiveRowIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const queryClient = useQueryClient();

  // Debounce the raw input into a query keyword
  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedKeyword(searchInput.trim());
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [searchInput]);

  // Auto-focus the input whenever the panel opens
  useEffect(() => {
    if (isSearchVisible) {
      setActiveRowIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isSearchVisible]);

  const trimmedKeyword = debouncedKeyword;

  // Reset keyboard selection whenever the result set identity changes
  useEffect(() => {
    setActiveRowIndex(-1);
  }, [filter, trimmedKeyword]);

  // Keep the keyboard-selected row visible within the virtualized viewport
  useEffect(() => {
    if (activeRowIndex >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: activeRowIndex, align: 'center', behavior: 'auto' });
    }
  }, [activeRowIndex]);

  const { data: results = EMPTY_RESULTS, isFetching } = useQuery({
    ...searchQuery.query({
      keyword: trimmedKeyword,
      filter,
      updateSearchHistory: false
    }),
    enabled: isSearchVisible && trimmedKeyword.length > 0
  });

  // Resolve blacklist flags via batched song hydration so entity queues
  // uphold Nora's global blacklist invariant (mirrors album page behaviour)
  const resolvePlayableSongIds = useCallback(
    async (songIds: number[]) => {
      try {
        const hydrated = await queryClient.fetchQuery(songQuery.queue({ songIds }));
        const songs = hydrated ?? [];
        const requested = new Set(songIds);
        return songs
          .filter((song) => !song.isBlacklisted && requested.has(song.songId))
          .map((song) => song.songId);
      } catch (err) {
        console.error('[MiniPlayerSearch] Failed to resolve playable songs:', err);
        return [];
      }
    },
    [queryClient]
  );

  const playableSongs = useMemo(
    () => results.songs.filter((song) => !song.isBlacklisted),
    [results.songs]
  );

  const rows = useMemo<MiniSearchRow[]>(() => {
    if (!trimmedKeyword) return [];

    const showSection = (entity: MiniSearchFilter) => filter === 'All' || filter === entity;
    const flattened: MiniSearchRow[] = [];

    if (showSection('Songs') && playableSongs.length > 0) {
      flattened.push({
        kind: 'header',
        id: 'header-songs',
        label: t('common.song_other', 'Songs')
      });
      playableSongs.forEach((song) =>
        flattened.push({ kind: 'song', id: `song-${song.songId}`, song })
      );
    }

    if (showSection('Artists') && results.artists.length > 0) {
      flattened.push({
        kind: 'header',
        id: 'header-artists',
        label: t('common.artist_other', 'Artists')
      });
      results.artists.forEach((artist) =>
        flattened.push({ kind: 'artist', id: `artist-${artist.artistId}`, artist })
      );
    }

    if (showSection('Albums') && results.albums.length > 0) {
      flattened.push({
        kind: 'header',
        id: 'header-albums',
        label: t('common.album_other', 'Albums')
      });
      results.albums.forEach((album) =>
        flattened.push({ kind: 'album', id: `album-${album.albumId}`, album })
      );
    }

    return flattened;
  }, [filter, playableSongs, results.artists, results.albums, t, trimmedKeyword]);

  const handlePlaySong = useCallback(
    (song: SongData) => {
      const queueSongIds = playableSongs.map((s) => s.songId);
      if (queueSongIds.length === 0) return;

      // Mirrors the main-player search behaviour: a fresh "Search Results" queue per play
      createQueue(queueSongIds, 'songs', false, undefined, false, 'Search Results');
      updateQueueData(queueSongIds.indexOf(song.songId), undefined, false, true);
      onClose();
    },
    [createQueue, onClose, playableSongs, updateQueueData]
  );

  const handleAddToQueue = useCallback(
    (song: SongData) => {
      getQueuesManager()
        .getActiveQueue()
        .addSongIdToEnd(song.songId);
      addNewNotifications([
        {
          id: `miniPlayerSearchAddedToQueue-${song.songId}`,
          duration: 5000,
          content: <span>{t('notifications.addedToQueue', { count: 1 })}</span>,
          icon: (
            <Img
              src={song.artworkPaths?.artworkPath}
              alt={t('song.artwork')}
              loading="eager"
            />
          )
        }
      ]);
    },
    [addNewNotifications, t]
  );

  const handlePlayArtist = useCallback(
    async (artist: Artist) => {
      const songIds = artist.songs.map((song) => song.songId);
      if (songIds.length === 0) return;

      const playableSongIds = await resolvePlayableSongIds(songIds);
      if (playableSongIds.length === 0) return;

      createQueue(playableSongIds, 'artist', false, artist.artistId, true, artist.name);
      onClose();
    },
    [createQueue, onClose, resolvePlayableSongIds]
  );

  const handlePlayAlbum = useCallback(
    async (album: Album) => {
      const songIds = album.songs.map((song) => song.songId);
      if (songIds.length === 0) return;

      const playableSongIds = await resolvePlayableSongIds(songIds);
      if (playableSongIds.length === 0) return;

      createQueue(playableSongIds, 'album', false, album.albumId, true, album.title);
      onClose();
    },
    [createQueue, onClose, resolvePlayableSongIds]
  );

  const activateRow = useCallback(
    (row: MiniSearchRow | undefined) => {
      if (!row) return;
      if (row.kind === 'song') handlePlaySong(row.song);
      else if (row.kind === 'artist') handlePlayArtist(row.artist);
      else if (row.kind === 'album') handlePlayAlbum(row.album);
    },
    [handlePlayAlbum, handlePlayArtist, handlePlaySong]
  );

  const selectableRowIndices = useMemo(
    () => rows.reduce<number[]>((acc, row, index) => (row.kind !== 'header' ? [...acc, index] : acc), []),
    [rows]
  );

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectableRowIndices.length === 0) return;

        setActiveRowIndex((prev) => {
          if (selectableRowIndices.length === 0) return -1;
          const currentPos = selectableRowIndices.indexOf(prev);
          if (currentPos === -1) return selectableRowIndices[e.key === 'ArrowDown' ? 0 : selectableRowIndices.length - 1];
          const nextPos =
            e.key === 'ArrowDown'
              ? Math.min(currentPos + 1, selectableRowIndices.length - 1)
              : Math.max(currentPos - 1, 0);
          return selectableRowIndices[nextPos];
        });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        activateRow(rows[activeRowIndex]);
      }
    },
    [activateRow, activeRowIndex, onClose, rows, selectableRowIndices]
  );

  const renderRow = useCallback(
    (_index: number, row: MiniSearchRow | undefined) => {
      // Virtuoso can transiently request indices beyond the array while the
      // result set shrinks mid-typing; render a placeholder row instead of crashing
      if (!row) {
        return <div className="h-[52px] max-h-[52px] min-h-[52px] w-full" aria-hidden="true" />;
      }

      if (row.kind === 'header') {
        return (
          <div className="flex h-[52px] items-end pb-1 pl-3">
            <span className="text-font-color-white/50 text-[10px] font-semibold tracking-wider uppercase select-none">
              {row.label}
            </span>
          </div>
        );
      }

      if (row.kind === 'song') {
        return (
          <MiniSearchSongRow
            song={row.song}
            isActive={rows[activeRowIndex]?.id === row.id}
            addToQueueText={t('common.addToQueue', 'Add to queue')}
            playText={t('common.play', 'Play')}
            unknownArtistText={t('common.unknownArtist')}
            onPlay={handlePlaySong}
            onAddToQueue={handleAddToQueue}
          />
        );
      }

      if (row.kind === 'artist') {
        return (
          <MiniSearchEntityRow
            testId={`mini-search-artist-${row.artist.artistId}`}
            title={row.artist.name}
            subtitle={t('common.songWithCount', { count: row.artist.songs.length })}
            artworkSrc={
              row.artist.onlineArtworkPaths?.picture_small ||
              row.artist.artworkPaths?.artworkPath
            }
            isCircularArtwork
            isActive={rows[activeRowIndex]?.id === row.id}
            onPlay={() => handlePlayArtist(row.artist)}
          />
        );
      }

      return (
        <MiniSearchEntityRow
          testId={`mini-search-album-${row.album.albumId}`}
          title={row.album.title}
          subtitle={
            row.album.artists?.map((a) => a.name).join(', ') ||
            t('common.unknownArtist')
          }
          artworkSrc={row.album.artworkPaths?.optimizedArtworkPath || row.album.artworkPaths?.artworkPath}
          isActive={rows[activeRowIndex]?.id === row.id}
          onPlay={() => handlePlayAlbum(row.album)}
        />
      );
    },
    [
      activeRowIndex,
      handleAddToQueue,
      handlePlayAlbum,
      handlePlayArtist,
      handlePlaySong,
      rows,
      t
    ]
  );

  if (!isSearchVisible) return null;

  const hasKeyword = trimmedKeyword.length > 0;
  const hasResults = rows.length > 0;

  return (
    <div
      data-testid="mini-player-search-container"
      role="group"
      aria-label={t('player.search', 'Search')}
      className="mini-player-search-container relative z-20 flex flex-1 flex-col overflow-hidden border-t border-white/5 bg-[rgba(33,34,38,0.5)] backdrop-blur-md [-webkit-app-region:no-drag]"
      onKeyDown={handleContainerKeyDown}
    >
      {/* Header: search input + filter pills */}
      <div className="shrink-0 px-3 py-2.5 [-webkit-app-region:no-drag]">
        <div className="bg-font-color-white/10 focus-within:bg-font-color-white/15 flex h-9 w-full items-center gap-2 rounded-lg px-2.5 transition-colors">
          <span className="material-icons-round text-font-color-white/50 text-lg leading-none">
            {isFetching ? 'hourglass_top' : 'search'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('miniPlayer.searchPlaceholder', 'Search songs, artists, albums…')}
            spellCheck={false}
            autoComplete="off"
            className="text-font-color-white placeholder:text-font-color-white/40 h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {searchInput.length > 0 && (
            <button
              type="button"
              className="text-font-color-white/40 hover:text-font-color-white flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/10"
              title={t('common.clear', 'Clear')}
              onClick={(e) => {
                e.currentTarget.blur();
                setSearchInput('');
                setDebouncedKeyword('');
                setActiveRowIndex(-1);
                inputRef.current?.focus();
              }}
            >
              <span className="material-icons-round text-sm">close</span>
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`shrink-0 cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                filter === f
                  ? 'bg-font-color-highlight/25 text-font-color-highlight dark:bg-dark-font-color-highlight/25 dark:text-dark-font-color-highlight'
                  : 'text-font-color-white/50 hover:bg-white/10 hover:text-font-color-white'
              }`}
              onClick={() => {
                setFilter(f);
                setActiveRowIndex(-1);
              }}
            >
              {t(FILTER_LABEL_KEYS[f], f)}
            </button>
          ))}
        </div>
      </div>

      {/* Results list */}
      <div className="min-h-0 flex-1 overflow-hidden px-1 pb-2">
        {hasResults ? (
          <VirtualizedList<MiniSearchRow>
            ref={virtuosoRef}
            data={rows}
            fixedItemHeight={ROW_HEIGHT}
            initialItemCount={12}
            style={{ height: '100%' }}
            itemContent={renderRow}
          />
        ) : (
          <div className="text-font-color-white/40 flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            {!hasKeyword ? (
              <>
                <span className="material-icons-round text-3xl opacity-50">search</span>
                {t('miniPlayer.searchHint', 'Type to search your library')}
              </>
            ) : isFetching ? (
              t('searchPage.searching', 'Searching...')
            ) : (
              <>
                <span className="material-icons-round text-3xl opacity-50">search_off</span>
                {t('searchPage.noResults', 'No results found')}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchContainer;
