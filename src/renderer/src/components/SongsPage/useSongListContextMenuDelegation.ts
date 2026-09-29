import { useNavigate } from '@tanstack/react-router';
import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useSongPreferences } from '../../contexts/SongPreferencesContext';
import { useQueueOperations } from '../../hooks/useQueueOperations';
import { store } from '../../store/store';
import {
  buildSongContextMenuData,
  buildSongContextMenuItems,
  type SongContextMenuInput,
  type SongContextMenuServices
} from './songContextMenuBuilder';

export interface DelegationTarget {
  song: SongData;
  index: number;
  songId: number;
}

export function resolveContextMenuTarget(
  target: HTMLElement,
  getItem: (index: number) => SongData | undefined
): DelegationTarget | null {
  // 1. Interactive target exclusion guard
  // Do not trigger context menu when clicking input or regular buttons (e.g. play, favorite, checkbox)
  if (
    target.closest(
      'input, textarea, button:not([data-more-options="true"]), [role="button"]:not([data-more-options="true"])'
    )
  ) {
    return null;
  }

  // 2. Locate target row
  const row = target.closest<HTMLElement>('[data-song-id]');
  if (!row) return null;

  const rawId = row.getAttribute('data-song-id');
  const rawIndex = row.getAttribute('data-song-index');
  if (rawId === null || rawIndex === null) return null;

  const songId = Number(rawId);
  const index = Number(rawIndex);
  if (Number.isNaN(songId) || Number.isNaN(index)) return null;

  const song = getItem(index);
  if (!song) return null;

  return { song, index, songId };
}

export interface UseSongListContextMenuDelegationParams {
  getItem: (index: number) => SongData | undefined;
  isCompact?: boolean;
  onPlayClick?: (songId: number) => void;
  additionalContextMenuItems?: ContextMenuItem[];
}

export function useSongListContextMenuDelegation({
  getItem,
  isCompact = false,
  onPlayClick,
  additionalContextMenuItems
}: UseSongListContextMenuDelegationParams) {
  const {
    updateContextMenuData,
    changePromptMenuData,
    addNewNotifications,
    toggleIsFavorite,
    toggleMultipleSelections,
    updateMultipleSelections,
    createQueue,
    playSong,
    openAutoTagDialog,
    openTrackIdentifyDialog,
    openGenreStyleDialog
  } = useContext(AppUpdateContext);

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addToNext, addToEnd } = useQueueOperations();
  const preferences = useSongPreferences();
  const doNotShowBlacklistSongConfirm = preferences.doNotShowBlacklistSongConfirm;

  const openMenuForSong = useCallback(
    async (song: SongData, _index?: number, pageX?: number, pageY?: number) => {
      const state = store.state;
      const isCurrentSong = state.currentSongData?.songId === song.songId;
      const currentSongFavorite = isCurrentSong ? state.currentSongData?.isAFavorite : undefined;
      const isAFavorite = currentSongFavorite !== undefined ? currentSongFavorite : song.isAFavorite;
      const isAMultipleSelection = state.multipleSelectionsData.multipleSelections.includes(song.songId);
      const isMultipleSelectionEnabled = state.multipleSelectionsData.isEnabled;

      const services: SongContextMenuServices = {
        t,
        navigate,
        addNewNotifications,
        changePromptMenuData,
        toggleMultipleSelections,
        updateMultipleSelections,
        createQueue,
        addToNext,
        addToEnd,
        toggleIsFavorite,
        playSong,
        handlePlayBtnClick: () => {
          if (onPlayClick) onPlayClick(song.songId);
          else playSong(song.songId);
        },
        openAutoTagDialog,
        openTrackIdentifyDialog,
        openGenreStyleDialog,
        doNotShowBlacklistSongConfirm
      };

      const menuInput: SongContextMenuInput = {
        ...song,
        isAFavorite,
        isCurrentSong,
        isAMultipleSelection,
        isMultipleSelectionEnabled,
        additionalContextMenuItems
      };

      const items = await buildSongContextMenuItems(menuInput, services, isCompact);
      const additionalData = buildSongContextMenuData(menuInput, { t }, isCompact);
      updateContextMenuData(true, items, pageX, pageY, additionalData);
    },
    [
      additionalContextMenuItems,
      addNewNotifications,
      addToEnd,
      addToNext,
      changePromptMenuData,
      createQueue,
      doNotShowBlacklistSongConfirm,
      isCompact,
      navigate,
      onPlayClick,
      openAutoTagDialog,
      openGenreStyleDialog,
      openTrackIdentifyDialog,
      playSong,
      t,
      toggleIsFavorite,
      toggleMultipleSelections,
      updateContextMenuData,
      updateMultipleSelections
    ]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = resolveContextMenuTarget(e.target as HTMLElement, getItem);
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      // Keyboard trigger (Shift+F10 / Menu key) has detail === 0 or client (0,0)
      const isKeyboard = e.detail === 0 || (e.clientX === 0 && e.clientY === 0);
      if (isKeyboard) {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-song-id]');
        const rect = row?.getBoundingClientRect() ?? { left: 100, bottom: 100 };
        void openMenuForSong(target.song, target.index, rect.left + 10, rect.bottom + 10);
      } else {
        const pageX = e.pageX || e.clientX;
        const pageY = e.pageY || e.clientY;
        void openMenuForSong(target.song, target.index, pageX, pageY);
      }
    },
    [getItem, openMenuForSong]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const targetEl = e.target as HTMLElement;
      const moreBtn = targetEl.closest<HTMLElement>('[data-more-options="true"]');
      if (!moreBtn) return;

      const row = moreBtn.closest<HTMLElement>('[data-song-id]');
      if (!row) return;

      const rawIndex = row.getAttribute('data-song-index');
      if (rawIndex === null) return;
      const index = Number(rawIndex);
      if (Number.isNaN(index)) return;

      const song = getItem(index);
      if (!song) return;

      e.stopPropagation();
      const rect = moreBtn.getBoundingClientRect();
      void openMenuForSong(song, index, rect.left + 10, rect.bottom + 10);
    },
    [getItem, openMenuForSong]
  );

  return {
    handleContextMenu,
    handleClick,
    openMenuForSong
  };
}
