import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { usePlaylistCoverPreview } from '../../hooks/usePlaylistCoverPreview';
import type { PlaylistCoverDraft, PlaylistCoverLayout, PlaylistCoverSettings } from '../../types/playlistCover';
import storage from '../../utils/localStorage';
import { isPlaylistCoverSettingsEqual } from '../../utils/isPlaylistCoverSettingsEqual';
import Button from '../Button';
import CoverLivePreview from './CoverLivePreview';
import CoverTypeSelector from './CoverTypeSelector';
import LayoutSelector from './LayoutSelector';
import NumberedSongPicker from './NumberedSongPicker';

interface Props {
  playlist: PlaylistDto;
  playlistSongs: SongData[];
}

const PlaylistCoverSettingsPrompt = ({ playlist, playlistSongs }: Props) => {
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const originalSettings: PlaylistCoverSettings = useMemo(() => {
    return (
      storage.playlistCoverSettings.getSettings(playlist.id) ?? {
        type: 'auto',
        collage: {
          layout: 'grid',
          size: 4,
          songIds: []
        }
      }
    );
  }, [playlist.id]);

  const [currentSettings, setCurrentSettings] = useState<PlaylistCoverSettings>(originalSettings);

  const draft: PlaylistCoverDraft = useMemo(() => {
    return {
      originalSettings,
      currentSettings,
      workingSongs: playlistSongs
    };
  }, [originalSettings, currentSettings, playlistSongs]);

  const resolvedPreviewCover = usePlaylistCoverPreview({ draft, playlist });

  const isDirty = useMemo(() => {
    return !isPlaylistCoverSettingsEqual(originalSettings, currentSettings);
  }, [originalSettings, currentSettings]);

  const handleTypeChange = useCallback((newType: PlaylistCoverSettings['type']) => {
    setCurrentSettings((prev) => ({
      ...prev,
      type: newType,
      collage: prev.collage || {
        layout: 'grid',
        size: 4,
        songIds: []
      }
    }));
  }, []);

  const handleLayoutChange = useCallback((newLayout: PlaylistCoverLayout) => {
    setCurrentSettings((prev) => ({
      ...prev,
      collage: {
        layout: newLayout,
        size: prev.collage?.size || 4,
        songIds: prev.collage?.songIds || []
      }
    }));
  }, []);

  const handleToggleSong = useCallback((songId: number) => {
    setCurrentSettings((prev) => {
      const currentIds = prev.collage?.songIds || [];
      const maxSize = prev.collage?.size || 4;
      const isSelected = currentIds.includes(songId);

      let newSongIds: number[];
      if (isSelected) {
        newSongIds = currentIds.filter((id) => id !== songId);
      } else {
        if (currentIds.length >= maxSize) {
          newSongIds = [...currentIds.slice(1), songId];
        } else {
          newSongIds = [...currentIds, songId];
        }
      }

      return {
        ...prev,
        collage: {
          layout: prev.collage?.layout || 'grid',
          size: maxSize,
          songIds: newSongIds
        }
      };
    });
  }, []);

  const handleReset = useCallback(() => {
    setCurrentSettings(originalSettings);
  }, [originalSettings]);

  const handleSave = useCallback(() => {
    if (!isDirty) return;
    storage.playlistCoverSettings.setSettings(playlist.id, currentSettings);
    changePromptMenuData(false);
  }, [changePromptMenuData, isDirty, playlist.id, currentSettings]);

  return (
    <div className="flex w-[460px] flex-col p-6 text-font-color-black dark:text-font-color-white max-h-[85vh] overflow-y-auto bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-xl">
      <div className="mb-5 flex items-center justify-between border-b border-neutral-800 pb-3">
        <span className="text-xl font-bold tracking-tight">
          {t('playlistsPage.coverSettingsTitle', 'Customize Playlist Cover')}
        </span>
        {isDirty && (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
            Unsaved Changes
          </span>
        )}
      </div>

      {/* Production-Identical Live Preview */}
      <CoverLivePreview resolvedCover={resolvedPreviewCover} />

      {/* Mode Selector (Auto vs Collage) */}
      <CoverTypeSelector type={currentSettings.type} onChange={handleTypeChange} />

      {/* Custom Collage Options */}
      {currentSettings.type === 'collage' && (
        <>
          {/* Data-Driven Layout Cards */}
          <LayoutSelector
            selectedLayout={currentSettings.collage?.layout || 'grid'}
            onChange={handleLayoutChange}
          />

          {/* Numbered Song Picker Cards */}
          <NumberedSongPicker
            playlistSongs={playlistSongs}
            selectedSongIds={currentSettings.collage?.songIds || []}
            maxSize={currentSettings.collage?.size || 4}
            onToggleSong={handleToggleSong}
          />
        </>
      )}

      {/* Footer Action Buttons */}
      <div className="mt-4 flex items-center justify-between pt-4 border-t border-neutral-800">
        <Button
          label={t('common.reset', 'Reset Changes')}
          type="tertiary"
          isDisabled={!isDirty}
          className={`${!isDirty ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer hover:text-white'}`}
          clickHandler={handleReset}
        />
        <div className="flex items-center gap-3">
          <Button
            label={t('common.cancel', 'Cancel')}
            type="tertiary"
            clickHandler={() => changePromptMenuData(false)}
          />
          <Button
            label={t('common.save', 'Save Changes')}
            type="primary"
            isDisabled={!isDirty}
            className={`${!isDirty ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
            clickHandler={handleSave}
          />
        </div>
      </div>
    </div>
  );
};

export default PlaylistCoverSettingsPrompt;
