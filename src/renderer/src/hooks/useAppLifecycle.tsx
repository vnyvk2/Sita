import { useEffect } from 'react';

import type AudioPlayer from '../other/player';
import { getQueuesManager } from '../other/queuesManager';
import { dispatch, flushPendingLocalStorage, store } from '../store/store';
import storage from '../utils/localStorage';

export interface AppLifecycleDependencies {
  audio: AudioPlayer | HTMLAudioElement;

  toggleShuffling: (isShuffling?: boolean) => void;
  toggleRepeat: (newState?: RepeatTypes) => void;
  playSongFromUnknownSource: (audioPlayerData: AudioPlayerData, isStartPlay?: boolean) => void;
  playSong: (songId: number, isStartPlay?: boolean, playAsCurrentSongIndex?: boolean) => void;
  changeUpNextSongData: (upNextSongData?: AudioPlayerData) => void;
  managePlaybackErrors: (error: unknown) => void;
  toggleSongPlayback: (startPlay?: boolean) => void;
  handleSkipBackwardClick: () => void;
  handleSkipForwardClick: (reason?: SongSkipReason) => void;
  refStartPlay: React.MutableRefObject<boolean>;
  windowManagement: {
    addSongTitleToTitleBar: () => void;
    resetTitleBarInfo: () => void;
  };
}

export function useAppLifecycle(dependencies: AppLifecycleDependencies): void {
  const {
    audio: playerInstance,
    toggleShuffling,
    toggleRepeat,
    playSongFromUnknownSource,
    playSong,
    changeUpNextSongData,
    managePlaybackErrors,
    toggleSongPlayback,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    refStartPlay,
    windowManagement
  } = dependencies;

  const player = playerInstance as unknown as (AudioPlayer & HTMLAudioElement);

  const manager = getQueuesManager();

  useEffect(() => {
    const { playback, queue } = storage.getAllItems();

    const syncLocalStorage = () => {
      const allItems = storage.getAllItems();
      dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: allItems });
      console.log('local storage updated');
    };

    // T3-1: startup restore outcome tracing. Two independent paths race below
    // (persisted/unknown-source song vs canonical-queue head); each logs
    // start/success/failure with its songId so the winner and any swallowed
    // rejection are visible without changing restore behavior.
    const logStartupRestore = (step: string, detail: unknown) => {
      console.log(`[StartupRestore] ${step}`, detail ?? '');
    };
    document.addEventListener('localStorage', syncLocalStorage);

    toggleShuffling(playback?.isShuffling);
    toggleRepeat(playback?.isRepeating);

    logStartupRestore('pathA.start', 'checkForStartUpSongs');
    window.api.audioLibraryControls
      .checkForStartUpSongs()
      .then((startUpSongData) => {
        if (startUpSongData) {
          logStartupRestore('pathA.unknown-source', {
            songId: (startUpSongData as AudioPlayerData)?.songId ?? null
          });
          playSongFromUnknownSource(startUpSongData, true);
        } else if (
          playback?.currentSong.songId &&
          typeof playback.currentSong.songId === 'number'
        ) {
          logStartupRestore('pathA.persisted-song', {
            songId: playback.currentSong.songId,
            stoppedPosition: Number(playback.currentSong.stoppedPosition) || 0
          });
          playSong(playback.currentSong.songId, false);

          const currSongPosition = Number(playback.currentSong.stoppedPosition);
          player.currentTime = currSongPosition;
          dispatch({
            type: 'UPDATE_SONG_POSITION',
            data: currSongPosition
          });
        } else {
          logStartupRestore('pathA.no-song', 'no unknown-source or persisted songId');
        }
        return undefined;
      })
      .catch((err) => {
        logStartupRestore('pathA.failed', err);
        console.error(err);
      });

    if (!queue || queue.queues.length === 0) {
      logStartupRestore('pathB.start', 'canonical queue head');
      window.api.audioLibraryControls
        .getAllSongIds()
        .then((songIds) => {
          if (songIds && songIds.length > 0) {
            // Startup default queue is the canonical All Songs projection
            // (docs/canonical-queue-architecture.md).
            const startupQueue = manager.getOrCreateCanonicalQueue({ songIds });
            if (startupQueue?.currentSongId) {
              logStartupRestore('pathB.canonical-head', {
                songId: startupQueue.currentSongId
              });
              playSong(startupQueue.currentSongId, true);
            } else {
              logStartupRestore('pathB.empty-queue', 'canonical queue has no current song');
            }
          } else {
            logStartupRestore('pathB.no-songs', 'library returned no song ids');
          }
          return undefined;
        })
        .catch((err) => {
          logStartupRestore('pathB.failed', err);
          console.error(err);
        });
    } else {
      logStartupRestore('pathB.skipped', 'persisted queue present');
    }

    return () => {
      document.removeEventListener('localStorage', syncLocalStorage);
    };
  }, []);

  useEffect(() => {
    let unsubscribeUpNext = () => {};

    const bindUpNext = () => {
      unsubscribeUpNext();
      const activeQueue = manager.getActiveQueue();

      const updateUpNext = async () => {
        const nextSongId = activeQueue.nextSongId;
        if (nextSongId) {
          try {
            const songData = await window.api.audioLibraryControls.getSong(nextSongId, false);
            if (songData) changeUpNextSongData(songData);
          } catch (err) {
            console.error('Failed to fetch up next song:', err);
          }
        } else {
          changeUpNextSongData(undefined);
        }
      };

      const unsubPosition = activeQueue.on('positionChange', updateUpNext);
      const unsubQueue = activeQueue.on('queueChange', updateUpNext);
      unsubscribeUpNext = () => {
        unsubPosition();
        unsubQueue();
      };
      updateUpNext(); // initial call
    };

    bindUpNext();
    const unsubManager = manager.on('activeQueueChanged', bindUpNext);

    return () => {
      unsubscribeUpNext();
      unsubManager();
    };
  }, []);

  useEffect(() => {
    const handlePlayerErrorEvent = (err: unknown) => managePlaybackErrors(err);
    const handlePlayerPlayEvent = () => {
      dispatch({
        type: 'CURRENT_SONG_PLAYBACK_STATE',
        data: true
      });
      window.api.playerControls.songPlaybackStateChange(true);
    };
    const handlePlayerPauseEvent = () => {
      dispatch({
        type: 'CURRENT_SONG_PLAYBACK_STATE',
        data: false
      });
      window.api.playerControls.songPlaybackStateChange(false);
    };
    const handleBeforeQuitEvent = async () => {
      try {
        // player.currentTime resolves through the native getter when the Rust
        // engine is active, so stoppedPosition stays exact in both backends.
        storage.playback.setCurrentSongOptions('stoppedPosition', player.currentTime);
        storage.playback.setPlaybackOptions('isRepeating', store.state.player.isRepeating);
        storage.playback.setPlaybackOptions('isShuffling', store.state.player.isShuffling);
        flushPendingLocalStorage();
      } catch (err) {
        console.error('Failed to flush storage before quit:', err);
      } finally {
        await Promise.resolve();
        window.api.quitEvent?.sendBeforeQuitEventAck?.();
      }
    };

    player.addEventListener('error', handlePlayerErrorEvent);
    player.addEventListener('play', handlePlayerPlayEvent);
    player.addEventListener('pause', handlePlayerPauseEvent);
    window.api.quitEvent.beforeQuitEvent(handleBeforeQuitEvent);

    return () => {
      player.removeEventListener('error', handlePlayerErrorEvent);
      player.removeEventListener('play', handlePlayerPlayEvent);
      player.removeEventListener('pause', handlePlayerPauseEvent);
      window.api.quitEvent.removeBeforeQuitEventListener(handleBeforeQuitEvent);
    };
  }, [managePlaybackErrors]);

  useEffect(() => {
    const displayDefaultTitleBar = () => {
      windowManagement.resetTitleBarInfo();
      storage.playback.setCurrentSongOptions('stoppedPosition', player.currentTime);
    };
    const playSongIfPlayable = () => {
      if (refStartPlay.current) toggleSongPlayback(true);
    };

    player.addEventListener('canplay', playSongIfPlayable);
    player.addEventListener('play', windowManagement.addSongTitleToTitleBar);
    player.addEventListener('pause', displayDefaultTitleBar);

    return () => {
      toggleSongPlayback(false);
      player.removeEventListener('canplay', playSongIfPlayable);
      player.removeEventListener('play', windowManagement.addSongTitleToTitleBar);
      player.removeEventListener('pause', displayDefaultTitleBar);
    };
  }, []);

  useEffect(() => {
    const handleToggleSongPlayback = () => toggleSongPlayback();
    const handleSkipForwardClickListener = () => handleSkipForwardClick('USER_SKIP');
    const handlePlaySongFromUnknownSource = (_: unknown, data: AudioPlayerData) =>
      playSongFromUnknownSource(data, true);

    window.api.unknownSource.playSongFromUnknownSource(handlePlaySongFromUnknownSource);
    window.api.playerControls.toggleSongPlayback(handleToggleSongPlayback);
    window.api.playerControls.skipBackwardToPreviousSong(handleSkipBackwardClick);
    window.api.playerControls.skipForwardToNextSong(handleSkipForwardClickListener);

    const unsubFloatingRemote = window.api.lyrics?.onFloatingLyricsRemoteControl?.((action) => {
      if (action === 'toggle') handleToggleSongPlayback();
      else if (action === 'next') handleSkipForwardClickListener();
      else if (action === 'prev') handleSkipBackwardClick();
    });

    return () => {
      unsubFloatingRemote?.();
      window.api.unknownSource.removePlaySongFromUnknownSourceEvent(
        handlePlaySongFromUnknownSource
      );
      window.api.playerControls.removeTogglePlaybackStateEvent(handleToggleSongPlayback);
      window.api.playerControls.removeSkipBackwardToPreviousSongEvent(handleSkipBackwardClick);
      window.api.playerControls.removeSkipForwardToNextSongEvent(handleSkipForwardClickListener);
      window.api.dataUpdates.removeDataUpdateEventListeners();
    };
  }, []);
}
