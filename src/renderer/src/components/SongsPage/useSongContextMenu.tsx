import { useNavigate } from '@tanstack/react-router';
import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useSongPreferences } from '../../contexts/SongPreferencesContext';
import { useQueueOperations } from '../../hooks/useQueueOperations';
import {
  buildSongContextMenuData,
  buildSongContextMenuItems,
  type SongContextMenuInput,
  type SongContextMenuServices
} from './songContextMenuBuilder';

export interface UseSongContextMenuParams {
  songId: number;
  title: string;
  artists?: { name: string; artistId: number }[];
  album?: { name: string; albumId: number };
  duration: number;
  year?: number;
  path: string;
  isBlacklisted?: boolean;
  genres?: { genreId: number | string; name: string }[];
  discNo?: number;
  trackNo?: number | string;
  isAFavorite: boolean;
  isCurrentSong: boolean;
  artworkPaths?: ArtworkPaths;
  isAMultipleSelection: boolean;
  isMultipleSelectionEnabled: boolean;
  additionalContextMenuItems?: ContextMenuItem[];
  handlePlayBtnClick: () => void;
  toggleSingleSongFavorite: () => void;
  isCompact?: boolean;
}

export interface UseSongContextMenuReturn {
  getContextMenuItems: () => Promise<ContextMenuItem[]>;
  getContextMenuData: () => ContextMenuAdditionalData;
  handleContextMenu: (e: React.MouseEvent) => void;
  handleMoreOptionsClick: (
    e: React.KeyboardEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
}

export function useSongContextMenu(params: UseSongContextMenuParams): UseSongContextMenuReturn {
  const {
    songId,
    title,
    artists,
    album,
    duration,
    year,
    path,
    isBlacklisted = false,
    genres,
    discNo,
    trackNo,
    isAFavorite,
    isCurrentSong,
    artworkPaths,
    isAMultipleSelection,
    isMultipleSelectionEnabled,
    additionalContextMenuItems,
    handlePlayBtnClick,
    toggleSingleSongFavorite,
    isCompact = false
  } = params;

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

  const getContextMenuItems = useCallback(async (): Promise<ContextMenuItem[]> => {
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
      handlePlayBtnClick,
      toggleSingleSongFavorite,
      openAutoTagDialog,
      openTrackIdentifyDialog,
      openGenreStyleDialog,
      doNotShowBlacklistSongConfirm
    };

    const menuInput: SongContextMenuInput = {
      songId,
      title,
      artists,
      album,
      duration,
      year,
      path,
      isBlacklisted,
      genres,
      discNo,
      trackNo,
      isAFavorite,
      isCurrentSong,
      artworkPaths,
      isAMultipleSelection,
      isMultipleSelectionEnabled,
      additionalContextMenuItems
    };

    return buildSongContextMenuItems(menuInput, services, isCompact);
  }, [
    additionalContextMenuItems,
    addNewNotifications,
    addToEnd,
    addToNext,
    album,
    artists,
    artworkPaths,
    changePromptMenuData,
    createQueue,
    discNo,
    doNotShowBlacklistSongConfirm,
    duration,
    genres,
    handlePlayBtnClick,
    isAFavorite,
    isAMultipleSelection,
    isBlacklisted,
    isCompact,
    isCurrentSong,
    isMultipleSelectionEnabled,
    navigate,
    openAutoTagDialog,
    openGenreStyleDialog,
    openTrackIdentifyDialog,
    path,
    playSong,
    songId,
    t,
    title,
    toggleIsFavorite,
    toggleMultipleSelections,
    toggleSingleSongFavorite,
    trackNo,
    updateMultipleSelections,
    year
  ]);

  const getContextMenuData = useCallback((): ContextMenuAdditionalData => {
    return buildSongContextMenuData(
      {
        title,
        artists,
        artworkPaths,
        isAMultipleSelection,
        isMultipleSelectionEnabled
      },
      { t },
      isCompact
    );
  }, [artists, artworkPaths, isAMultipleSelection, isCompact, isMultipleSelectionEnabled, t, title]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pageX = e.pageX || e.clientX;
      const pageY = e.pageY || e.clientY;
      void getContextMenuItems().then((items) => {
        const additionalData = getContextMenuData();
        updateContextMenuData(true, items, pageX, pageY, additionalData);
      });
    },
    [getContextMenuItems, getContextMenuData, updateContextMenuData]
  );

  const handleMoreOptionsClick = useCallback(
    (
      e: React.KeyboardEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
      e.stopPropagation();
      const pageX = 'pageX' in e ? e.pageX || e.clientX : undefined;
      const pageY = 'pageY' in e ? e.pageY || e.clientY : undefined;
      void getContextMenuItems().then((items) => {
        const additionalData = getContextMenuData();
        updateContextMenuData(true, items, pageX, pageY, additionalData);
      });
    },
    [getContextMenuItems, getContextMenuData, updateContextMenuData]
  );

  return {
    getContextMenuItems,
    getContextMenuData,
    handleContextMenu,
    handleMoreOptionsClick
  };
}

export default useSongContextMenu;
