import { SpecialPlaylists } from '@common/playlists.enum';
import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { usePlaylistCoverPreview } from '../../hooks/usePlaylistCoverPreview';
import { type CoverSlotIndex, type PlaylistCoverDraft, type PlaylistCoverLayout, type PlaylistCoverSettings } from '../../types/playlistCover';
import storage from '../../utils/localStorage';
import { isPlaylistCoverSettingsEqual } from '../../utils/isPlaylistCoverSettingsEqual';
import { resolveEffectiveCoverSongs } from '../../utils/resolveEffectiveCoverSongs';
import Button from '../Button';
import CoverLivePreview from './CoverLivePreview';
import CoverTypeSelector from './CoverTypeSelector';
import LayoutSelector from './LayoutSelector';
import NumberedSongPicker from './NumberedSongPicker';
import SelectedSongsReorderBar from './SelectedSongsReorderBar';

interface Props {
  playlist: PlaylistDto;
  playlistSongs: SongData[];
}

const BADGES = ['①', '②', '③', '④', '⑤'];

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

  // Phase 3D Slot Interaction States
  const [activeSlotIndex, setActiveSlotIndex] = useState<CoverSlotIndex | null>(null);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<CoverSlotIndex | null>(null);
  const [focusedSlotIndex, setFocusedSlotIndex] = useState<CoverSlotIndex | null>(null);

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

  // Reset interactive slot states whenever type, layout, or count changes
  const handleTypeChange = useCallback((newType: PlaylistCoverSettings['type']) => {
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
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
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
    setCurrentSettings((prev) => {
      const currentSize = prev.collage?.size || 4;
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
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
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

  const handleSelectSlot = useCallback((slot: CoverSlotIndex) => {
    setActiveSlotIndex((prev) => (prev === slot ? null : slot));
  }, []);

  const handleSwapSlots = useCallback((fromIndex: CoverSlotIndex, toIndex: CoverSlotIndex) => {
    setCurrentSettings((prev) => {
      const currentIds = [...(prev.collage?.songIds || [])];
      const maxSize = prev.collage?.size || 4;

      // Ensure array has elements up to required swap indices
      while (currentIds.length <= Math.max(fromIndex, toIndex)) {
        currentIds.push(0);
      }

      const temp = currentIds[fromIndex];
      currentIds[fromIndex] = currentIds[toIndex];
      currentIds[toIndex] = temp;

      return {
        ...prev,
        collage: {
          layout: prev.collage?.layout || 'grid',
          size: maxSize,
          songIds: currentIds.filter((id) => id !== undefined)
        }
      };
    });
  }, []);

  const handleClearSlot = useCallback((slot: CoverSlotIndex) => {
    setCurrentSettings((prev) => {
      const currentIds = [...(prev.collage?.songIds || [])];
      const maxSize = prev.collage?.size || 4;

      if (slot < currentIds.length) {
        currentIds[slot] = 0;
      }

      return {
        ...prev,
        collage: {
          layout: prev.collage?.layout || 'grid',
          size: maxSize,
          songIds: currentIds
        }
      };
    });
    setActiveSlotIndex((prev) => (prev === slot ? null : prev));
  }, []);

  const handleToggleSong = useCallback(
    (songId: number) => {
      setCurrentSettings((prev) => {
        const currentIds = prev.collage?.songIds || [];
        const maxSize = prev.collage?.size || 4;

        // Targeted Replacement Mode
        if (activeSlotIndex !== null) {
          const updatedIds = [...currentIds];
          // Remove existing instance if present to prevent duplicate song assignments
          const existingIndex = updatedIds.indexOf(songId);
          if (existingIndex !== -1 && existingIndex !== activeSlotIndex) {
            updatedIds[existingIndex] = 0;
          }
          // Fill empty preceding slots with 0 if necessary
          while (updatedIds.length < activeSlotIndex) {
            updatedIds.push(0);
          }
          updatedIds[activeSlotIndex] = songId;

          return {
            ...prev,
            collage: {
              layout: prev.collage?.layout || 'grid',
              size: maxSize,
              songIds: updatedIds.filter((id) => id !== undefined)
            }
          };
        }

        // Standard Append / Remove Mode
        const isSelected = currentIds.includes(songId);
        if (isSelected) {
          return {
            ...prev,
            collage: {
              layout: prev.collage?.layout || 'grid',
              size: maxSize,
              songIds: currentIds.map((id) => id === songId ? 0 : id)
            }
          };
        }

        // Find the first empty slot if available, otherwise append
        const emptyIndex = currentIds.indexOf(0);
        
        if (emptyIndex === -1 && currentIds.length >= maxSize) {
          return prev;
        }

        const updatedIds = [...currentIds];
        if (emptyIndex !== -1) {
          updatedIds[emptyIndex] = songId;
        } else {
          updatedIds.push(songId);
        }

        return {
          ...prev,
          collage: {
            layout: prev.collage?.layout || 'grid',
            size: maxSize,
            songIds: updatedIds
          }
        };
      });

      // Clear active slot after targeted replacement
      if (activeSlotIndex !== null) {
        setActiveSlotIndex(null);
      }
    },
    [activeSlotIndex]
  );

  const handleReset = useCallback(() => {
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
    setCurrentSettings(originalSettings);
  }, [originalSettings]);

  const handleSave = useCallback(() => {
    if (!isDirty || !playlist?.id || SpecialPlaylists.isSpecialPlaylistId(playlist.id)) return;
    storage.playlistCoverSettings.setSettings(playlist.id, currentSettings);
    changePromptMenuData(false);
  }, [changePromptMenuData, isDirty, playlist?.id, currentSettings]);

  const currentSize = currentSettings.collage?.size || 4;
  const isDiamond = currentSettings.collage?.layout === 'diamond';
  const availableCounts = isDiamond ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];

  // Single Source of Truth for Effective Cover Songs
  const effectiveSongs = useMemo(() => {
    return resolveEffectiveCoverSongs(currentSettings, playlistSongs, currentSize);
  }, [currentSettings, playlistSongs, currentSize]);

  return (
    <div className="flex w-[480px] flex-col p-6 text-font-color-black dark:text-font-color-white max-h-[85vh] overflow-y-auto bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl">
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
      <CoverLivePreview
        resolvedCover={resolvedPreviewCover}
        requestedCount={currentSize}
        activeSlotIndex={activeSlotIndex}
        hoveredSlotIndex={hoveredSlotIndex}
        focusedSlotIndex={focusedSlotIndex}
        onSelectSlot={handleSelectSlot}
        onHoverSlot={setHoveredSlotIndex}
      />

      {/* Targeted Replacement Banner */}
      {activeSlotIndex !== null && (
        <div className="mb-5 flex items-center justify-between rounded-xl bg-amber-500/15 border border-amber-500/30 p-3 text-amber-300 shadow-md transition-all duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 font-bold text-neutral-950 text-xs">
              {BADGES[activeSlotIndex]}
            </span>
            <span className="text-xs font-semibold">
              Replacing Slot {BADGES[activeSlotIndex]} — Click any song below to assign
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveSlotIndex(null)}
            className="rounded-lg bg-amber-500/20 px-2 py-1 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

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

          {/* Selected Songs Reorder & Position Swap Bar */}
          <SelectedSongsReorderBar
            effectiveSongs={effectiveSongs}
            maxSize={currentSize}
            activeSlotIndex={activeSlotIndex}
            hoveredSlotIndex={hoveredSlotIndex}
            focusedSlotIndex={focusedSlotIndex}
            onSelectSlot={handleSelectSlot}
            onHoverSlot={setHoveredSlotIndex}
            onSwapSlots={handleSwapSlots}
            onClearSlot={handleClearSlot}
          />

          {/* Numbered Song Picker */}
          <NumberedSongPicker
            playlistSongs={playlistSongs}
            selectedSongIds={currentSettings.collage?.songIds || []}
            maxSize={currentSize}
            activeSlotIndex={activeSlotIndex}
            onToggleSong={handleToggleSong}
          />
        </>
      )}

      {/* Action Buttons (Reset vs Save) */}
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-neutral-800 pt-4">
        <Button label={t('common.reset', 'Reset')} isDisabled={!isDirty} clickHandler={handleReset} />
        <Button label={t('common.save', 'Save')} isDisabled={!isDirty} clickHandler={handleSave} />
      </div>
    </div>
  );
};

export default PlaylistCoverSettingsPrompt;
