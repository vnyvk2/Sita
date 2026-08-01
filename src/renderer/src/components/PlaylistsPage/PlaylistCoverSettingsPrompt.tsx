import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { usePlaylistCoverPreview } from '../../hooks/usePlaylistCoverPreview';
import { COVER_IMAGE_COUNTS, type PlaylistCoverDraft, type PlaylistCoverLayout, type PlaylistCoverSettings } from '../../types/playlistCover';
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
    setCurrentSettings((prev) => {
      const currentSize = prev.collage?.size || 4;
      // If switching away from Diamond and current size is 5, trim size back to 4
      const nextSize = (newLayout !== 'diamond' && currentSize > 4 ? 4 : currentSize) as 1 | 2 | 3 | 4 | 5;
      const currentIds = prev.collage?.songIds || [];
      const newSongIds = currentIds.length > nextSize ? currentIds.slice(0, nextSize) : currentIds;

      return {
        ...prev,
        collage: {
          layout: newLayout,
          size: nextSize,
          songIds: newSongIds
        }
      };
    });
  }, []);

  const handleSizeChange = useCallback((newSize: 1 | 2 | 3 | 4 | 5) => {
    setCurrentSettings((prev) => {
      const currentIds = prev.collage?.songIds || [];
      const newSongIds = currentIds.length > newSize ? currentIds.slice(0, newSize) : currentIds;
      return {
        ...prev,
        collage: {
          layout: prev.collage?.layout || 'grid',
          size: newSize,
          songIds: newSongIds
        }
      };
    });
  }, []);

  const handleToggleSong = useCallback((songId: number) => {
    setCurrentSettings((prev) => {
      const currentIds = prev.collage?.songIds || [];
      const maxSize = prev.collage?.size || 4;
      const isSelected = currentIds.includes(songId);

      if (isSelected) {
        return {
          ...prev,
          collage: {
            layout: prev.collage?.layout || 'grid',
            size: maxSize,
            songIds: currentIds.filter((id) => id !== songId)
          }
        };
      }

      if (currentIds.length >= maxSize) {
        return prev;
      }

      return {
        ...prev,
        collage: {
          layout: prev.collage?.layout || 'grid',
          size: maxSize,
          songIds: [...currentIds, songId]
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

  const currentSize = currentSettings.collage?.size || 4;

  const isDiamond = currentSettings.collage?.layout === 'diamond';
  const availableCounts = isDiamond ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];

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
      <CoverLivePreview resolvedCover={resolvedPreviewCover} requestedCount={currentSettings.collage?.size} />

      {/* Mode Selector (Auto vs Collage) */}
      <CoverTypeSelector type={currentSettings.type} onChange={handleTypeChange} />

      {/* Cover Images Count Selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-semibold text-neutral-300">Cover Images</label>
        <div className={`grid ${isDiamond ? 'grid-cols-5' : 'grid-cols-4'} gap-2 rounded-xl bg-neutral-900/70 p-1.5 border border-neutral-800`}>
          {availableCounts.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSizeChange(s as 1 | 2 | 3 | 4 | 5)}
              className={`flex items-center justify-center rounded-lg py-2 text-sm font-semibold transition-all duration-200 cursor-pointer ${
                currentSize === s
                  ? 'bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

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
            maxSize={currentSize}
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
