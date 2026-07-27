import { lazy, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type AudioPlayer from '../other/player';
import { getQueuesManager } from '../other/queuesManager';
import { dispatch, store } from '../store/store';
import storage from '../utils/localStorage';
import log from '../utils/log';

const ErrorPrompt = lazy(() => import('../components/ErrorPrompt'));
const SongUnplayableErrorPrompt = lazy(() => import('../components/SongUnplayableErrorPrompt'));

export function usePlayerControl(
  playerInstance: AudioPlayer | HTMLAudioElement,
  recordListeningData: (
    songId: number,
    songDuration: number,
    repetition?: boolean,
    isKnownSource?: boolean
  ) => void,
  managePlaybackErrors: (error: unknown) => void,
  changePromptMenuData: (
    isVisible?: boolean,
    prompt?: React.ReactNode | null,
    className?: string
  ) => void,
  addNewNotifications: (notifications: AppNotification[]) => void
) {
  const { t } = useTranslation();
  const refStartPlay = useRef(false);

  const player =
    playerInstance instanceof HTMLAudioElement
      ? playerInstance
      : (playerInstance as AudioPlayer).audio;
  const audioPlayer =
    playerInstance instanceof HTMLAudioElement ? null : (playerInstance as AudioPlayer);
  const manager = getQueuesManager();

  const toggleSongPlayback = useCallback(
    (startPlay?: boolean) => {
      if (store.state.currentSongData?.songId) {
        if (audioPlayer) {
          return audioPlayer.togglePlayback(startPlay).catch((err) => managePlaybackErrors(err));
        }

        if (typeof startPlay !== 'boolean' || startPlay === player.paused) {
          if (player.readyState > 0) {
            if (player.paused) {
              return player
                .play()
                .then(() => {
                  const playbackChange = new CustomEvent('player/playbackChange');
                  return player.dispatchEvent(playbackChange);
                })
                .catch((err) => managePlaybackErrors(err));
            }
            if (player.ended) {
              player.currentTime = 0;
              return player
                .play()
                .then(() => {
                  const playbackChange = new CustomEvent('player/playbackChange');
                  return player.dispatchEvent(playbackChange);
                })
                .catch((err) => managePlaybackErrors(err));
            }
            const playbackChange = new CustomEvent('player/playbackChange');
            player.dispatchEvent(playbackChange);
            return player.pause();
          }
        }
      } else
        addNewNotifications([
          {
            id: 'noSongToPlay',
            content: t('notifications.selectASongToPlay'),
            iconName: 'error',
            iconClassName: 'material-icons-round-outlined'
          }
        ]);
      return undefined;
    },
    [addNewNotifications, t, managePlaybackErrors, player, audioPlayer]
  );

  const playSong = useCallback(
    (songId: number, isStartPlay = true, _playAsCurrentSongIndex = false) => {
      if (typeof songId === 'number') {
        if (audioPlayer) {
          return audioPlayer.playSongById(songId, {
            autoPlay: isStartPlay,
            recordListening: true,
            onError: (error) => {
              changePromptMenuData(true, <SongUnplayableErrorPrompt err={error as Error} />);
            }
          });
        }

        return window.api.audioLibraryControls
          .getSong(songId)
          .then((songData) => {
            if (songData) {
              dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: songData });
              storage.playback.setCurrentSongOptions('songId', songData.songId);
              player.src = `${songData.path}?ts=${Date.now()}`;

              const trackChangeEvent = new CustomEvent('player/trackchange', {
                detail: songId
              });
              player.dispatchEvent(trackChangeEvent);

              refStartPlay.current = isStartPlay;
              if (isStartPlay) toggleSongPlayback();
              recordListeningData(songId, songData.duration);
            }
            return undefined;
          })
          .catch((err) => {
            changePromptMenuData(true, <SongUnplayableErrorPrompt err={err} />);
          });
      }
      changePromptMenuData(
        true,
        <ErrorPrompt
          reason="SONG_ID_UNDEFINED"
          message={`${t('player.errorTitle')}\nERROR : SONG_ID_UNDEFINED`}
        />
      );
      return log(
        'ERROR OCCURRED WHEN TRYING TO PLAY A S0NG.',
        { error: 'Song id is of unknown type', songIdType: typeof songId, songId },
        'ERROR'
      );
    },
    [audioPlayer, changePromptMenuData, toggleSongPlayback, recordListeningData, player, t]
  );

  const playSongFromUnknownSource = useCallback(
    (audioPlayerData: AudioPlayerData, isStartPlay = true) => {
      if (audioPlayerData) {
        const { isKnownSource } = audioPlayerData;
        if (isKnownSource) playSong(audioPlayerData.songId);
        else {
          dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: audioPlayerData });
          player.src = `${audioPlayerData.path}?ts=${Date.now()}`;
          refStartPlay.current = isStartPlay;
          if (isStartPlay) toggleSongPlayback();
          recordListeningData(audioPlayerData.songId, audioPlayerData.duration, undefined, false);
        }
      }
    },
    [playSong, recordListeningData, toggleSongPlayback, player]
  );

  const updateCurrentSongData = useCallback(
    (callback: (prevData: AudioPlayerData) => AudioPlayerData) => {
      const updatedData = callback(store.state.currentSongData);
      if (updatedData) {
        dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: updatedData });
      }
    },
    []
  );

  const clearAudioPlayerData = useCallback(() => {
    toggleSongPlayback(false);

    player.currentTime = 0;
    player.pause();

    const currentSongId = store.state.currentSongData.songId;
    if (currentSongId) {
      const playerQueue = manager.getActiveQueue();
      playerQueue.removeSongId(currentSongId);
    }

    dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: {} as AudioPlayerData });

    addNewNotifications([
      {
        id: 'songPausedOnDelete',
        duration: 7500,
        content: t('notifications.playbackPausedDueToSongDeletion')
      }
    ]);
  }, [addNewNotifications, t, toggleSongPlayback, player, manager]);

  const updateCurrentSongPlaybackState = useCallback((isPlaying: boolean) => {
    if (isPlaying !== store.state.player.isCurrentSongPlaying) {
      dispatch({ type: 'CURRENT_SONG_PLAYBACK_STATE', data: isPlaying });
    }
  }, []);

  return {
    toggleSongPlayback,
    playSong,
    playSongFromUnknownSource,
    updateCurrentSongData,
    clearAudioPlayerData,
    updateCurrentSongPlaybackState,
    refStartPlay
  };
}
