/**
 * Shared types and utilities for auto-tag operations.
 *
 * Used by TrackIdentifyDialog, GenreStyleDialog, and background quick-actions (artwork, lyrics) to
 * resolve full song data from songIds obtained via multi-selection.
 */

export interface SongDataForAutoTag {
  songId: number;
  title: string;
  artists?: { name: string; artistId?: number }[];
  album?: { name: string; albumId?: number };
  genres?: { name: string }[];
  trackNo?: number;
  discNo?: number;
  year?: number;
  path: string;
  duration?: number;
  artworkPath?: string;
}

/**
 * Resolve full song data for auto-tag operations from an array of songIds. Uses the existing
 * `getSongInfo` IPC endpoint with `preserveIdOrder = true` to maintain the caller's ordering
 * (important for sequential track processing).
 */
export async function resolveAutoTagSongs(songIds: number[]): Promise<SongDataForAutoTag[]> {
  const songs = await window.api.audioLibraryControls.getSongInfo(
    songIds,
    undefined,
    undefined,
    undefined,
    true
  );
  if (!songs) return [];
  return songs.map((s) => ({
    songId: s.songId,
    title: s.title,
    artists: s.artists,
    album: s.album,
    genres: s.genres,
    trackNo: s.trackNo,
    discNo: s.discNo,
    year: s.year,
    path: s.path,
    duration: s.duration,
    artworkPath: s.artworkPaths?.artworkPath
  }));
}

/**
 * Group songs by album name for album-level operations (genre/style, artwork). Songs without an
 * album are grouped under '(No Album)'.
 */
export function groupSongsByAlbum(songs: SongDataForAutoTag[]): Map<string, SongDataForAutoTag[]> {
  const groups = new Map<string, SongDataForAutoTag[]>();
  for (const song of songs) {
    const key = song.album?.name || '(No Album)';
    const group = groups.get(key) || [];
    group.push(song);
    groups.set(key, group);
  }
  return groups;
}

/**
 * Update missing artwork for an array of songs. For each song, searches for artwork by album &
 * artist, builds preview and applies it. Returns statistics of { updated, skipped, failed }.
 */
export async function updateMissingArtworkForSongs(
  songs: SongDataForAutoTag[],
  onProgress?: (current: number, total: number) => void
): Promise<{ updated: number; skipped: number; failed: number }> {
  const { metadataApi } = await import('../services/metadataApi');
  const { queryClient } = await import('../queryClient');
  const { songQuery } = await import('../queries/songs');
  const { albumQuery } = await import('../queries/albums');

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  // DEF-TAG-10: group by album so one search/preview/apply cycle covers a whole
  // album instead of N+1 per-track cycles, and use a unique operation id per IPC
  // call - MetadataWorkflowService.createAbortSignal cancels the previous
  // controller for a reused id, so sharing one id across a loop risks
  // self-inflicted aborts.
  const baseOpId = `artwork-bg-${Date.now()}`;
  const groups = groupSongsByAlbum(songs);
  let groupIdx = 0;

  for (const [, groupSongs] of groups) {
    const gi = groupIdx++;

    const first = groupSongs[0];
    const albumName = first.album?.name;
    const artistName = first.artists?.[0]?.name;

    if (!albumName && !first.title) {
      skipped += groupSongs.length;
      continue;
    }

    try {
      const searchOpId = `${baseOpId}-g${gi}-search`;
      const candidates = await metadataApi.workflowSearch(
        'artwork',
        { album: albumName ?? first.title, artist: artistName },
        searchOpId
      );

      if (!candidates || candidates.length === 0) {
        skipped += groupSongs.length;
        continue;
      }

      const localInput = groupSongs.map((song) => ({
        songId: song.songId,
        title: song.title,
        artist: song.artists?.[0]?.name ?? '',
        album: song.album?.name ?? '',
        path: song.path,
        trackNumber: song.trackNo,
        discNumber: song.discNo,
        year: song.year,
        duration: song.duration,
        artworkPath: song.artworkPath
      }));

      const topCandidate = candidates[0];
      const previewOpId = `${baseOpId}-g${gi}-preview`;
      const preview = await metadataApi.workflowBuildPreview(
        'artwork',
        localInput,
        topCandidate.id,
        topCandidate.provider,
        previewOpId
      );

      if (preview) {
        const applyOpId = `${baseOpId}-g${gi}-apply`;
        const res = await metadataApi.workflowApplyPreview(
          'artwork',
          preview,
          ['artworkUrl', 'artworkPath'],
          undefined,
          applyOpId
        );
        if (res.success) {
          // Honor per-song counts when the result reports them; a group apply
          // can partially succeed.
          const groupUpdated =
            typeof res.updatedCount === 'number' ? res.updatedCount : groupSongs.length;
          updated += groupUpdated;
          failed += Math.max(0, groupSongs.length - groupUpdated);
        } else {
          failed += groupSongs.length;
        }
      } else {
        failed += groupSongs.length;
      }
    } catch {
      failed += groupSongs.length;
    }
    onProgress?.(gi + 1, groups.size);
  }

  if (updated > 0) {
    queryClient.invalidateQueries({ queryKey: songQuery._def });
    queryClient.invalidateQueries({ queryKey: albumQuery._def });
  }

  return { updated, skipped, failed };
}

/**
 * Update missing lyrics for an array of songs. For each song without existing lyrics, fetches
 * lyrics online via LRCLIB and automatically saves them. Returns statistics of { updated, skipped,
 * failed }.
 */
export async function updateMissingLyricsForSongs(
  songs: SongDataForAutoTag[],
  onProgress?: (current: number, total: number) => void
): Promise<{ updated: number; skipped: number; failed: number }> {
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    onProgress?.(i + 1, songs.length);

    try {
      // Check if offline lyrics already exist
      const offline = await window.api.lyrics.getSongLyrics(
        {
          songTitle: song.title,
          songArtists: song.artists?.map((a) => a.name),
          album: song.album?.name,
          songPath: song.path,
          duration: song.duration ?? 0
        },
        'ANY',
        'OFFLINE_ONLY'
      );

      const hasOfflineLyrics = Boolean(
        offline?.isOfflineLyricsAvailable ||
        offline?.lyrics?.unparsedLyrics ||
        (offline?.lyrics?.parsedLyrics && offline.lyrics.parsedLyrics.length > 0)
      );

      if (hasOfflineLyrics) {
        skipped++;
        continue;
      }

      // Fetch online lyrics and auto-save
      const fetched = await window.api.lyrics.getSongLyrics(
        {
          songTitle: song.title,
          songArtists: song.artists?.map((a) => a.name),
          album: song.album?.name,
          songPath: song.path,
          duration: song.duration ?? 0
        },
        'ANY',
        'ONLINE_ONLY',
        'SYNCED_OR_UN_SYNCED'
      );

      const hasFetchedLyrics = Boolean(
        fetched?.lyrics?.unparsedLyrics ||
        (fetched?.lyrics?.parsedLyrics && fetched.lyrics.parsedLyrics.length > 0)
      );

      if (hasFetchedLyrics) {
        updated++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }
  }

  return { updated, skipped, failed };
}

/**
 * Fill only empty genre/artwork fields for an array of songs via the main-process gap-fill service
 * (per-album grouped commits, one undo checkpoint per album). Identity fields are never touched.
 */
export async function fillMetadataGaps(
  songs: SongDataForAutoTag[],
  onProgress?: (current: number, total: number) => void
): Promise<{
  updated: number;
  skipped: number;
  failed: number;
  albumsProcessed: number;
  errors: string[];
}> {
  const { metadataApi } = await import('../services/metadataApi');
  const { queryClient } = await import('../queryClient');
  const { songQuery } = await import('../queries/songs');
  const { albumQuery } = await import('../queries/albums');
  const { genreQuery } = await import('../queries/genres');

  onProgress?.(0, songs.length);
  const res = await metadataApi.fillGaps(
    songs.map((song) => ({
      songId: song.songId,
      title: song.title,
      artist: song.artists?.[0]?.name,
      album: song.album?.name,
      genre: song.genres?.[0]?.name,
      year: song.year,
      trackNumber: song.trackNo,
      discNumber: song.discNo,
      path: song.path,
      duration: song.duration,
      artworkPath: song.artworkPath
    })),
    `gapfill-${Date.now()}`
  );
  onProgress?.(songs.length, songs.length);

  if (res.updated > 0) {
    queryClient.invalidateQueries({ queryKey: songQuery._def });
    queryClient.invalidateQueries({ queryKey: albumQuery._def });
    queryClient.invalidateQueries({ queryKey: genreQuery._def });
  }

  return res;
}

/**
 * Rolls back the most recent gap-fill checkpoint (checkpoints are journaled per album, so one undo
 * reverts one album) and refreshes library queries.
 */
export async function undoFillGaps(): Promise<{ success: boolean; restoredCount: number }> {
  const { metadataApi } = await import('../services/metadataApi');
  const { queryClient } = await import('../queryClient');
  const { songQuery } = await import('../queries/songs');
  const { albumQuery } = await import('../queries/albums');
  const { genreQuery } = await import('../queries/genres');

  const res = await metadataApi.undoLastAutoTag(`gapfill-undo-${Date.now()}`);
  if (res.success && res.restoredCount > 0) {
    queryClient.invalidateQueries({ queryKey: songQuery._def });
    queryClient.invalidateQueries({ queryKey: albumQuery._def });
    queryClient.invalidateQueries({ queryKey: genreQuery._def });
  }
  return { success: res.success, restoredCount: res.restoredCount };
}
